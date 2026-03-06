import { useState } from 'react';
import { StyleSheet, TextInput, Pressable, Modal } from 'react-native';

import { Text, View } from '@/components/Themed';

interface NoteEditorProps {
  visible: boolean;
  selectedText: string;
  onSave: (noteText: string) => void;
  onCancel: () => void;
}

export default function NoteEditor({ visible, selectedText, onSave, onCancel }: NoteEditorProps) {
  const [noteText, setNoteText] = useState('');

  const handleSave = () => {
    onSave(noteText);
    setNoteText('');
  };

  const handleCancel = () => {
    setNoteText('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <Text style={styles.title}>Add a Note</Text>

          <View style={styles.selectedTextBox}>
            <Text style={styles.selectedTextLabel}>Selected text:</Text>
            <Text style={styles.selectedText} numberOfLines={3}>"{selectedText}"</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Write your note here..."
            value={noteText}
            onChangeText={setNoteText}
            multiline
            autoFocus
          />

          <View style={styles.buttons}>
            <Pressable style={styles.cancelButton} onPress={handleCancel}>
              <Text>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Note</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  editor: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 300,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  selectedTextBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedTextLabel: {
    fontSize: 12,
    opacity: 0.5,
    marginBottom: 4,
  },
  selectedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  saveButton: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
