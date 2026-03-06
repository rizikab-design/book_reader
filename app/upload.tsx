import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function UploadScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upload a Book</Text>
      <Text style={styles.subtitle}>Pick a PDF or ePub from your device.</Text>
      <View style={styles.dropZone}>
        <Text style={styles.dropZoneText}>Tap here to select a file</Text>
        <Text style={styles.dropZoneHint}>Supports PDF and ePub formats</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    marginBottom: 32,
  },
  dropZone: {
    width: '100%',
    height: 200,
    borderWidth: 2,
    borderColor: '#2f95dc',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneText: {
    fontSize: 16,
    color: '#2f95dc',
    fontWeight: '600',
    marginBottom: 4,
  },
  dropZoneHint: {
    fontSize: 13,
    opacity: 0.5,
  },
});
