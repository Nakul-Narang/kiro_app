import { Server as SocketIOServer, Socket } from 'socket.io';
import { WebSocketMessage, UserPresence } from '../../types';
import { InventoryEventService } from '../inventory/InventoryEventService';
import { logger } from '../../utils/logger';
import { getRedisClient } from '../../config/database';

/**
 * WebSocket service for real-time communication
 */
export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, Socket> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private presencePrefix = 'presence:';
  private messagePrefix = 'message:';

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
    this.setupInventoryEventIntegration();
  }

  /**
   * Setup integration with inventory event system
   */
  private setupInventoryEventIntegration(): void {
    const inventoryEventService = InventoryEventService.getInstance();
    inventoryEventService.setWebSocketService(this);
    logger.info('✅ WebSocket service integrated with inventory events');
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // Handle user authentication and presence
      socket.on('authenticate', async (data: { userId: string; preferredLanguage: string }) => {
        await this.handleUserAuthentication(socket, data);
      });

      // Handle joining trade sessions
      socket.on('join_session', async (data: { sessionId: string }) => {
        await this.handleJoinSession(socket, data);
      });

      // Handle leaving trade sessions
      socket.on('leave_session', async (data: { sessionId: string }) => {
        await this.handleLeaveSession(socket, data);
      });

      // Handle sending messages
      socket.on('send_message', async (data: WebSocketMessage) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle negotiation offers
      socket.on('send_offer', async (data: any) => {
        await this.handleSendOffer(socket, data);
      });

      // Handle typing indicators
      socket.on('typing', async (data: { sessionId: string; isTyping: boolean }) => {
        await this.handleTyping(socket, data);
      });

      // Handle inventory subscription
      socket.on('subscribe_inventory', async (data: { vendorId?: string; categories?: string[] }) => {
        await this.handleInventorySubscription(socket, data);
      });

      // Handle inventory unsubscription
      socket.on('unsubscribe_inventory', async () => {
        await this.handleInventoryUnsubscription(socket);
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        await this.handleDisconnection(socket);
      });
    });
  }

  /**
   * Handle user authentication and set up presence
   */
  private async handleUserAuthentication(socket: Socket, data: { userId: string; preferredLanguage: string }): Promise<void> {
    try {
      const { userId, preferredLanguage } = data;
      
      // Store user connection
      this.connectedUsers.set(userId, socket);
      socket.data.userId = userId;
      socket.data.preferredLanguage = preferredLanguage;

      // Update user presence
      const presence: UserPresence = {
        userId,
        status: 'online',
        lastSeen: new Date(),
        activeSessionIds: [],
        preferredLanguage
      };

      await this.updateUserPresence(presence);
      
      // Join user to their personal room
      await socket.join(`user:${userId}`);
      
      // Notify about successful authentication
      socket.emit('authenticated', { success: true, userId });
      
      logger.info(`User authenticated: ${userId}`);
      
    } catch (error) {
      logger.error('Authentication failed:', error);
      socket.emit('authentication_error', { error: 'Authentication failed' });
    }
  }

  /**
   * Handle joining a trade session
   */
  private async handleJoinSession(socket: Socket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const userId = socket.data.userId;
      
      if (!userId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Join session room
      await socket.join(`session:${sessionId}`);
      
      // Update user sessions tracking
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
      }
      this.userSessions.get(userId)!.add(sessionId);

      // Update presence with active session
      const presence = await this.getUserPresence(userId);
      if (presence) {
        presence.activeSessionIds.push(sessionId);
        await this.updateUserPresence(presence);
      }

      // Notify session participants
      socket.to(`session:${sessionId}`).emit('user_joined_session', {
        userId,
        sessionId,
        timestamp: new Date()
      });

      socket.emit('session_joined', { sessionId, success: true });
      
      logger.info(`User ${userId} joined session ${sessionId}`);
      
    } catch (error) {
      logger.error('Failed to join session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  }

  /**
   * Handle leaving a trade session
   */
  private async handleLeaveSession(socket: Socket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const userId = socket.data.userId;
      
      if (!userId) {
        return;
      }

      // Leave session room
      await socket.leave(`session:${sessionId}`);
      
      // Update user sessions tracking
      const userSessions = this.userSessions.get(userId);
      if (userSessions) {
        userSessions.delete(sessionId);
      }

      // Update presence
      const presence = await this.getUserPresence(userId);
      if (presence) {
        presence.activeSessionIds = presence.activeSessionIds.filter(id => id !== sessionId);
        await this.updateUserPresence(presence);
      }

      // Notify session participants
      socket.to(`session:${sessionId}`).emit('user_left_session', {
        userId,
        sessionId,
        timestamp: new Date()
      });

      socket.emit('session_left', { sessionId, success: true });
      
      logger.info(`User ${userId} left session ${sessionId}`);
      
    } catch (error) {
      logger.error('Failed to leave session:', error);
    }
  }

  /**
   * Handle sending messages
   */
  private async handleSendMessage(socket: Socket, data: WebSocketMessage): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId || userId !== data.senderId) {
        socket.emit('error', { message: 'Unauthorized message send' });
        return;
      }

      // Store message (would integrate with message storage service)
      await this.storeMessage(data);
      
      // Broadcast to session participants
      socket.to(`session:${data.sessionId}`).emit('new_message', data);
      
      // Send delivery confirmation to sender
      socket.emit('message_sent', { 
        messageId: this.generateMessageId(),
        timestamp: new Date() 
      });
      
      logger.info(`Message sent in session ${data.sessionId} by ${userId}`);
      
    } catch (error) {
      logger.error('Failed to send message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle sending negotiation offers
   */
  private async handleSendOffer(socket: Socket, data: any): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Broadcast offer to session participants
      socket.to(`session:${data.sessionId}`).emit('new_offer', {
        ...data,
        senderId: userId,
        timestamp: new Date()
      });
      
      // Send confirmation to sender
      socket.emit('offer_sent', { 
        sessionId: data.sessionId,
        success: true,
        timestamp: new Date() 
      });
      
      logger.info(`Offer sent in session ${data.sessionId} by ${userId}: ${data.amount}`);
      
    } catch (error) {
      logger.error('Failed to send offer:', error);
      socket.emit('error', { message: 'Failed to send offer' });
    }
  }

  /**
   * Handle typing indicators
   */
  private async handleTyping(socket: Socket, data: { sessionId: string; isTyping: boolean }): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId) {
        return;
      }

      // Broadcast typing status to session participants
      socket.to(`session:${data.sessionId}`).emit('user_typing', {
        userId,
        sessionId: data.sessionId,
        isTyping: data.isTyping,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('Failed to handle typing indicator:', error);
    }
  }

  /**
   * Handle inventory subscription
   */
  private async handleInventorySubscription(socket: Socket, data: { vendorId?: string; categories?: string[] }): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId) {
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Join inventory notification rooms
      if (data.vendorId) {
        await socket.join(`inventory:vendor:${data.vendorId}`);
        logger.debug(`User ${userId} subscribed to vendor ${data.vendorId} inventory updates`);
      }

      if (data.categories && data.categories.length > 0) {
        for (const category of data.categories) {
          await socket.join(`inventory:category:${category}`);
        }
        logger.debug(`User ${userId} subscribed to categories: ${data.categories.join(', ')}`);
      }

      // Join general inventory updates room
      await socket.join('inventory:general');

      socket.emit('inventory_subscription_confirmed', {
        vendorId: data.vendorId,
        categories: data.categories,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to handle inventory subscription:', error);
      socket.emit('error', { message: 'Failed to subscribe to inventory updates' });
    }
  }

  /**
   * Handle inventory unsubscription
   */
  private async handleInventoryUnsubscription(socket: Socket): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId) {
        return;
      }

      // Leave all inventory rooms
      const rooms = Array.from(socket.rooms);
      const inventoryRooms = rooms.filter(room => room.startsWith('inventory:'));
      
      for (const room of inventoryRooms) {
        await socket.leave(room);
      }

      socket.emit('inventory_unsubscription_confirmed', {
        timestamp: new Date()
      });

      logger.debug(`User ${userId} unsubscribed from inventory updates`);

    } catch (error) {
      logger.error('Failed to handle inventory unsubscription:', error);
    }
  }

  /**
   * Handle user disconnection
   */
  private async handleDisconnection(socket: Socket): Promise<void> {
    try {
      const userId = socket.data.userId;
      
      if (!userId) {
        return;
      }

      // Remove from connected users
      this.connectedUsers.delete(userId);
      
      // Update presence to offline
      const presence = await this.getUserPresence(userId);
      if (presence) {
        presence.status = 'offline';
        presence.lastSeen = new Date();
        await this.updateUserPresence(presence);
      }

      // Clean up session tracking
      this.userSessions.delete(userId);
      
      logger.info(`User disconnected: ${userId}`);
      
    } catch (error) {
      logger.error('Failed to handle disconnection:', error);
    }
  }

  /**
   * Send message to specific user
   */
  public async sendToUser(userId: string, event: string, data: any): Promise<boolean> {
    try {
      const socket = this.connectedUsers.get(userId);
      
      if (socket) {
        socket.emit(event, data);
        return true;
      }
      
      // User not connected, could queue message for later delivery
      logger.warn(`User ${userId} not connected for message delivery`);
      return false;
      
    } catch (error) {
      logger.error('Failed to send message to user:', error);
      return false;
    }
  }

  /**
   * Send message to all users in a session
   */
  public async sendToSession(sessionId: string, event: string, data: any): Promise<void> {
    try {
      this.io.to(`session:${sessionId}`).emit(event, data);
      logger.debug(`Message sent to session ${sessionId}: ${event}`);
    } catch (error) {
      logger.error('Failed to send message to session:', error);
    }
  }

  /**
   * Get user presence information
   */
  private async getUserPresence(userId: string): Promise<UserPresence | null> {
    try {
      const redis = getRedisClient();
      const presenceData = await redis.get(`${this.presencePrefix}${userId}`);
      
      if (presenceData) {
        return JSON.parse(presenceData) as UserPresence;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get user presence:', error);
      return null;
    }
  }

  /**
   * Update user presence information
   */
  private async updateUserPresence(presence: UserPresence): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(
        `${this.presencePrefix}${presence.userId}`,
        3600, // 1 hour TTL
        JSON.stringify(presence)
      );
    } catch (error) {
      logger.error('Failed to update user presence:', error);
    }
  }

  /**
   * Store message (placeholder - would integrate with actual message storage)
   */
  private async storeMessage(message: WebSocketMessage): Promise<void> {
    try {
      const redis = getRedisClient();
      const messageKey = `${this.messagePrefix}${message.sessionId}:${Date.now()}`;
      await redis.setEx(messageKey, 86400, JSON.stringify(message)); // 24 hour TTL
    } catch (error) {
      logger.error('Failed to store message:', error);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connected users count
   */
  public getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get active sessions count
   */
  public getActiveSessionsCount(): number {
    return Array.from(this.userSessions.values())
      .reduce((total, sessions) => total + sessions.size, 0);
  }

  /**
   * Broadcast inventory update to relevant users
   */
  public async broadcastInventoryUpdate(event: {
    eventType: string;
    productId: string;
    vendorId: string;
    product?: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      const notification = {
        type: 'inventory_update',
        ...event
      };

      // Notify vendor's subscribers
      this.io.to(`inventory:vendor:${event.vendorId}`).emit('inventory_notification', notification);

      // Notify category subscribers if product data is available
      if (event.product && event.product.category) {
        this.io.to(`inventory:category:${event.product.category}`).emit('inventory_notification', notification);
      }

      // Notify general inventory subscribers for major events
      if (['product_created', 'availability_changed'].includes(event.eventType)) {
        this.io.to('inventory:general').emit('inventory_notification', notification);
      }

      logger.debug(`📡 Broadcasted inventory update: ${event.eventType} for product ${event.productId}`);
    } catch (error) {
      logger.error('❌ Error broadcasting inventory update:', error);
    }
  }

  /**
   * Send inventory notification to specific user
   */
  public async sendInventoryNotification(userId: string, notification: any): Promise<boolean> {
    try {
      return await this.sendToUser(userId, 'inventory_notification', notification);
    } catch (error) {
      logger.error('❌ Error sending inventory notification:', error);
      return false;
    }
  }

  /**
   * Get inventory subscription statistics
   */
  public getInventorySubscriptionStats(): {
    totalSubscribers: number;
    vendorSubscriptions: number;
    categorySubscriptions: number;
    generalSubscriptions: number;
  } {
    const stats = {
      totalSubscribers: 0,
      vendorSubscriptions: 0,
      categorySubscriptions: 0,
      generalSubscriptions: 0
    };

    // Count subscriptions by room type
    this.io.sockets.adapter.rooms.forEach((sockets, roomName) => {
      if (roomName.startsWith('inventory:')) {
        const subscriberCount = sockets.size;
        
        if (roomName.startsWith('inventory:vendor:')) {
          stats.vendorSubscriptions += subscriberCount;
        } else if (roomName.startsWith('inventory:category:')) {
          stats.categorySubscriptions += subscriberCount;
        } else if (roomName === 'inventory:general') {
          stats.generalSubscriptions = subscriberCount;
        }
      }
    });

    stats.totalSubscribers = Math.max(
      stats.vendorSubscriptions,
      stats.categorySubscriptions,
      stats.generalSubscriptions
    );

    return stats;
  }
}

// Export factory function to create WebSocket service
export function createWebSocketService(io: SocketIOServer): WebSocketService {
  return new WebSocketService(io);
}