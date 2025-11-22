import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { GasService } from '../services/gasService';

// TODO: Replace mock location with real Geolocation.getCurrentPosition()
// Hardcoded MOCK_LOCATION should be moved to configuration or environment variable before production.
const MOCK_LOCATION = { lat: 44.98, lon: -93.55 }; // Approximate OHS location

export const EventsScreen = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  const fetchEvents = async () => {
    try {
      // In real app: Get actual location
      const data = await GasService.getEvents(MOCK_LOCATION);
      setEvents(data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const handleCheckIn = async (eventCode: string) => {
    try {
      setCheckInLoading(true);
      const result = await GasService.checkIn(eventCode, MOCK_LOCATION);

      if (result.valid) {
        Alert.alert('Success!', result.message);
        // Refresh to show status update if needed
        fetchEvents();
      } else {
        Alert.alert('Check-in Failed', result.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Check-in failed');
    } finally {
        setCheckInLoading(false);
    }
  };

  const renderEventItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.eventName}>{item.eventName}</Text>
        <Text style={styles.eventTime}>
          {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <Text style={styles.location}>{item.locationName}</Text>

      {item.distance !== null && (
        <Text style={styles.distance}>
          {Math.round(item.distance)}m away
        </Text>
      )}

      <TouchableOpacity
        style={styles.checkInButton}
        onPress={() => handleCheckIn(item.eventCode)}
      >
        <Text style={styles.buttonText}>Check In</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Active Events</Text>

      {loading ? (
        <Text style={styles.centered}>Loading events...</Text>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.eventCode}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.centered}>No active events found nearby.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    padding: 20,
    backgroundColor: '#fff',
    color: '#1b3b87',
  },
  listContent: {
    padding: 15,
  },
  centered: {
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  eventName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  eventTime: {
    fontSize: 14,
    color: '#1b3b87',
    fontWeight: '600',
  },
  location: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  distance: {
    fontSize: 12,
    color: '#999',
    marginBottom: 15,
  },
  checkInButton: {
    backgroundColor: '#b5121b', // Secondary red
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
