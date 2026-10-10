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
