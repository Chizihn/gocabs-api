# Firebase Push Notifications with Expo Setup

## Frontend Changes Required

### 1. Install Required Packages
```bash
npx expo install @react-native-firebase/app @react-native-firebase/messaging
```

### 2. Configure Firebase in Expo App
Add to your `app.json`:
```json
{
  "expo": {
    "android": {
      "package": "com.yourapp.gocabs",
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "bundleIdentifier": "com.yourapp.gocabs",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "plugins": [
      "@react-native-firebase/app"
    ]
  }
}
```

### 3. Update Frontend Notification Service

```typescript
import messaging from '@react-native-firebase/messaging';
import { UPDATE_FCM_TOKEN } from "./queries";
import { apolloClient } from "./apollo";
import * as SecureStore from "expo-secure-store";

class NotificationService {
  async requestUserPermission() {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      this.getFCMToken();
    }
  }

  async getFCMToken() {
    try {
      const fcmToken = await messaging().getToken();
      console.log('FCM Token:', fcmToken);
      
      // Send to backend
      await this.sendTokenToBackend(fcmToken);
      
      // Store locally
      await SecureStore.setItemAsync('fcmToken', fcmToken);
      
      return fcmToken;
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }

  async sendTokenToBackend(token: string) {
    try {
      await apolloClient.mutate({
        mutation: UPDATE_FCM_TOKEN,
        variables: { fcmToken: token },
      });
      console.log('FCM token sent to backend successfully');
    } catch (error) {
      console.error('Error sending FCM token to backend:', error);
    }
  }

  // Listen for token refresh
  setupTokenRefreshListener() {
    messaging().onTokenRefresh(token => {
      console.log('FCM Token refreshed:', token);
      this.sendTokenToBackend(token);
    });
  }

  // Listen for incoming messages
  setupMessageListener() {
    messaging().onMessage(async remoteMessage => {
      console.log('Received FCM message:', remoteMessage);
      // Handle foreground messages
    });

    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Received background FCM message:', remoteMessage);
    });
  }
}

export default new NotificationService();
```

### 4. Initialize in App Root
```typescript
// App.tsx
import React, { useEffect } from 'react';
import NotificationService from './services/NotificationService';

export default function App() {
  useEffect(() => {
    // Initialize notifications
    NotificationService.requestUserPermission();
    NotificationService.setupTokenRefreshListener();
    NotificationService.setupMessageListener();
  }, []);

  // Rest of your app...
}
```

## Backend Changes Required

### 1. Revert to Firebase (Keep original setup)
Your backend should use Firebase Admin SDK as originally planned.

### 2. Get Firebase Config Files
- Go to Firebase Console → Project Settings
- Download `google-services.json` for Android
- Download `GoogleService-Info.plist` for iOS
- Place them in your Expo project root

## Why This Approach is Better

### 1. Matches PRD Requirements
- ✅ Firebase for notifications (as specified)
- ✅ Web3-friendly (Firebase integrates well with blockchain apps)
- ✅ Scalable and production-ready

### 2. Better Features
- ✅ Cross-platform (iOS, Android, Web)
- ✅ Advanced targeting and analytics
- ✅ Better delivery reliability
- ✅ Support for rich media and interactive notifications

### 3. Future-Proof
- ✅ Easy to add web notifications
- ✅ Firebase Analytics integration
- ✅ Cloud Functions for complex notification logic

## Testing the Setup

### 1. Verify Firebase Configuration
```bash
# Check if Firebase is properly initialized
npx expo run:android
# or
npx expo run:ios
```

### 2. Test Token Generation
- Check console logs for FCM token
- Verify token is sent to backend
- Check database for stored token

### 3. Test Push Notifications
Use Firebase Console to send test messages:
1. Go to Firebase Console → Cloud Messaging
2. Create new campaign
3. Target by FCM token (copy from logs)
4. Send test message

## Migration Steps

1. **Install Firebase packages** in frontend
2. **Add Firebase config files** to project
3. **Update notification service** to use Firebase
4. **Revert backend** to Firebase Admin SDK
5. **Test end-to-end flow**
6. **Deploy and monitor**

This approach gives you the best of both worlds: Expo's development experience with Firebase's powerful backend infrastructure.
