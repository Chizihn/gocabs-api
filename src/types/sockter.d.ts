// src/types/socket.d.ts
import { Socket } from 'socket.io';
import { User } from '@prisma/client';

declare module 'socket.io' {
  interface Socket {
    user?: User; 
  }
}