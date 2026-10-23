import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
  Alert,
} from "react-native";

export default function CustomerHomeScreen() {
  const handleBookRide = () => {
    Alert.alert("Customer App", "Success! Your customer screen is working.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>🚕</Text>
        </View>

        <Text style={styles.title}>RideNow</Text>

        <Text style={styles.subtitle}>Your journey, your way.</Text>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome, Customer!</Text>

          <Text style={styles.description}>
            Book your ride, travel comfortably, and reach your destination
            safely.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleBookRide}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Book a Ride</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Safe rides. Reliable journeys.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 26,
    backgroundColor: "#FACC15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoText: {
    fontSize: 44,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 16,
    color: "#64748B",
    marginTop: 8,
    marginBottom: 36,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  welcome: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 23,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#FACC15",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  footer: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 36,
  },
});
