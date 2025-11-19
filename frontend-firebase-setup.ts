// // FRONTEND: Updated Notification Service with Firebase FCM
// // This replaces your current Expo-only notification service

// import messaging from '@react-native-firebase/messaging';
// import { UPDATE_FCM_TOKEN } from "./queries";
// import { apolloClient } from "./apollo";
// import * as SecureStore from "expo-secure-store";

// class NotificationService {
//   // Initialize Firebase notifications
//   async initialize() {
//     // Request permission
//     const authStatus = await messaging().requestPermission();
//     const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || 
//                    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

//     if (enabled) {
//       console.log('Firebase messaging permission granted');
      
//       // Get FCM token
//       await this.getFCMToken();
      
//       // Setup listeners
//       this.setupTokenRefreshListener();
//       this.setupMessageListener();
//     } else {
//       console.log('Firebase messaging permission denied');
//     }
//   }

//   // Get Firebase FCM token (this replaces Expo token)
//   async getFCMToken() {
//     try {
//       // Check if we have a stored token
//       const storedToken = await SecureStore.getItemAsync('fcmToken');
      
//       // Get current token from Firebase
//       const fcmToken = await messaging().getToken();
      
//       console.log('Firebase FCM Token:', fcmToken);
      
//       // Only send to backend if token changed
//       if (fcmToken !== storedToken) {
//         await this.sendTokenToBackend(fcmToken);
//         await SecureStore.setItemAsync('fcmToken', fcmToken);
//       }
      
//       return fcmToken;
//     } catch (error) {
//       console.error('Error getting FCM token:', error);
//       return null;
//     }
//   }

//   // Send FCM token to backend (same mutation, different token type)
//   async sendTokenToBackend(token: string) {
//     try {
//       const result = await apolloClient.mutate({
//         mutation: UPDATE_FCM_TOKEN,
//         variables: { fcmToken: token },
//       });
      
//       console.log('FCM token sent to backend successfully:', result);
//       return true;
//     } catch (error) {
//       console.error('Error sending FCM token to backend:', error);
//       return false;
//     }
//   }

//   // Listen for token refresh (Firebase automatically refreshes tokens)
//   setupTokenRefreshListener() {
//     messaging().onTokenRefresh(async (token) => {
//       console.log('FCM Token refreshed:', token);
      
//       // Send new token to backend
//       await this.sendTokenToBackend(token);
      
//       // Store new token
//       await SecureStore.setItemAsync('fcmToken', token);
//     });
//   }

//   // Listen for incoming messages (when app is in foreground)
//   setupMessageListener() {
//     messaging().onMessage(async (remoteMessage) => {
//       console.log('Received Firebase message in foreground:', remoteMessage);
      
//       // Handle the notification
//       this.handleNotification(remoteMessage);
//     });

//     // Handle background messages
//     messaging().setBackgroundMessageHandler(async (remoteMessage) => {
//       console.log('Received Firebase message in background:', remoteMessage);
      
//       // Handle background notification
//       return this.handleBackgroundNotification(remoteMessage);
//     });
//   }

//   // Handle foreground notifications
//   handleNotification(remoteMessage: any) {
//     const { notification, data } = remoteMessage;
    
//     if (notification) {
//       // Show local notification (you might want to use expo-notifications for this)
//       console.log('Notification title:', notification.title);
//       console.log('Notification body:', notification.body);
//       console.log('Notification data:', data);
      
//       // You can trigger local notification here using expo-notifications
//       // This gives you the best of both worlds - Firebase delivery + Expo display
//     }
//   }

//   // Handle background notifications
//   async handleBackgroundNotification(remoteMessage: any) {
//     const { notification, data } = remoteMessage;
    
//     // Process background data
//     if (data?.type === 'rideUpdate') {
//       // Handle ride updates
//       console.log('Ride update received:', data.bookingId);
//     } else if (data?.type === 'rewards') {
//       // Handle reward notifications
//       console.log('Rewards earned:', data);
//     }
    
//     return Promise.resolve();
//   }

//   // Get initial notification (when app opens from notification)
//   async getInitialNotification() {
//     const message = await messaging().getInitialNotification();
    
//     if (message) {
//       console.log('App opened from notification:', message);
//       this.handleNotification(message);
//     }
    
//     return message;
//   }

//   // Subscribe to topics (for targeted notifications)
//   async subscribeToTopic(topic: string) {
//     try {
//       await messaging().subscribeToTopic(topic);
//       console.log(`Subscribed to topic: ${topic}`);
//     } catch (error) {
//       console.error('Error subscribing to topic:', error);
//     }
//   }

//   // Unsubscribe from topics
//   async unsubscribeFromTopic(topic: string) {
//     try {
//       await messaging().unsubscribeFromTopic(topic);
//       console.log(`Unsubscribed from topic: ${topic}`);
//     } catch (error) {
//       console.error('Error unsubscribing from topic:', error);
//     }
//   }
// }

// export default new NotificationService();

// // USAGE IN YOUR APP:
// // 
// // 1. In your App.tsx or main component:
// // 
// // import React, { useEffect } from 'react';
// // import NotificationService from './services/NotificationService';
// // 
// // export default function App() {
// //   useEffect(() => {
// //     // Initialize Firebase notifications
// //     NotificationService.initialize();
// //     
// //     // Check if app opened from notification
// //     NotificationService.getInitialNotification();
// //     
// //     // Subscribe to relevant topics
// //     NotificationService.subscribeToTopic('all_users');
// //     NotificationService.subscribeToTopic('ride_updates');
// //   }, []);
// //   
// //   return <YourAppComponents />;
// // }
// //
// // 2. For NFT holders, you might want:
// //
// // // After wallet connection and NFT verification
// // if (isNFTHolder) {
// //   NotificationService.subscribeToTopic('nft_holders');
// //   NotificationService.subscribeToTopic('priority_rides');
// // }
// //
// // 3. For event-specific notifications:
// //
// // NotificationService.subscribeToTopic(`event_${eventId}`);

// export {};
