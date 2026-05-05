import { useState, useRef, useCallback } from 'react';
import { uploadVoice } from '../api';

export const useVoice = ({ chatId, senderId, replyToId = null, onSent }) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const durationRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const secs = durationRef.current;

        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('audio', blob, `voice-${Date.now()}.webm`);
          formData.append('chatId', chatId);
          formData.append('senderId', senderId);
          formData.append('duration', secs);
          if (replyToId) {
            formData.append('replyTo', replyToId);
          }

          const res = await uploadVoice(formData);
          onSent && onSent(res.data?.data || res.data);
        } catch (err) {
          console.error('Voice upload failed:', err.message);
        } finally {
          setUploading(false);
          setDuration(0);
          durationRef.current = 0;
        }
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied: ' + err.message);
    }
  }, [chatId, senderId, replyToId, onSent]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setDuration(0);
  }, []);

  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return { recording, duration, uploading, startRecording, stopRecording, cancelRecording, formatDuration };
};
