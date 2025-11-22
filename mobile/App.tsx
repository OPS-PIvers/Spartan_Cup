import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { EventsScreen } from './src/screens/EventsScreen';
import { Config } from './src/config';
import { Button, View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Configure Google Sign-In at the app root level
    // See documentation: https://github.com/react-native-google-signin/google-signin#configuration
    GoogleSignin.configure({
      webClientId: Config.WEB_CLIENT_ID,
      offlineAccess: true,
      scopes: ['email', 'profile']
    });

    // Check if user is already signed in
    checkSignIn();
  }, []);

  const checkSignIn = async () => {
    try {
      const isSignedIn = await GoogleSignin.isSignedIn();
      setIsAuthenticated(isSignedIn);
    } catch (error) {
      console.error('Sign-in check failed:', error);
    } finally {
      setIsReady(true);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await GoogleSignin.signOut();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Sign-out failed:', error);
    }
  };

  if (!isReady) {
     return (
       <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
         <ActivityIndicator size="large" color="#1b3b87" />
       </View>
     );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={({ navigation }) => ({
                headerRight: () => (
                  <Button
                    onPress={() => navigation.navigate('Events')}
                    title="Events"
                  />
                ),
                headerLeft: () => (
                    <Button onPress={handleLogout} title="Logout" color="red" />
                )
              })}
            />
            <Stack.Screen name="Events" component={EventsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
