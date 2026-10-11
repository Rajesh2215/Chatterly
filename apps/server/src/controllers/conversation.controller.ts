import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';

export async function getOrCreateDirect(req: Request, res: Response): Promise<void> {
  try {
    const { currentUserId, participantId } = req.body;

    if (!currentUserId || !participantId) {
      res.status(400).json({
        success: false,
        error: 'Both currentUserId and participantId are required',
      });
      return;
    }

    const { conversation, isNew } = await conversationService.getOrCreateDirectConversation(
      currentUserId,
      participantId
    );

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: conversation,
      isNew,
    });
  } catch (error: any) {
    const message = error.message || 'Internal Server Error';
    const status = message.includes('not found') ? 404 : message.includes('Cannot start') ? 400 : 500;

    res.status(status).json({
      success: false,
      error: message,
    });
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const conversationId = req.params.id as string;
    const { senderId, content } = req.body;

    if (!conversationId || !senderId || !content) {
      res.status(400).json({
        success: false,
        error: 'conversationId, senderId, and content are required',
      });
      return;
    }

    const response = await conversationService.sendMessage(conversationId, senderId, content);
    res.status(201).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    const message = error.message || 'Internal Server Error';
    const status = message.includes('not found')
      ? 404
      : message.includes('not a participant')
        ? 403
        : 400;
    res.status(status).json({
      success: false,
      error: message,
    });
  }
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  try {
    const conversationId = req.params.id as string;
    const { cursor, limit } = req.query;

    if (!conversationId) {
      res.status(400).json({
        success: false,
        error: 'Conversation ID is required',
      });
      return;
    }

    const result = await conversationService.getMessages({
      conversationId,
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.status(200).json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}