import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as BrowserSpeechWindow;
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
};

const normalizeVoiceError = (errorCode: string) => {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow mic access and try again.";
    case "no-speech":
      return "No speech was detected. Try again in a quieter place.";
    case "audio-capture":
      return "No microphone was found for voice input.";
    case "network":
      return "Speech recognition hit a network problem. Try again.";
    default:
      return "Voice input failed. Please try again.";
  }
};

export const useVoiceInput = (language = "en-US") => {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const buildRecognition = useCallback(() => {
    const recognitionConstructor = getSpeechRecognitionConstructor();
    if (!recognitionConstructor) {
      return null;
    }

    const recognition = new recognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setError(null);
      setTranscript("");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let nextTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result[0] ?? result.item(0);
        if (!alternative?.transcript) {
          continue;
        }

        nextTranscript += alternative.transcript;
      }

      setTranscript(nextTranscript.trim());
    };

    recognition.onerror = (event) => {
      setError(normalizeVoiceError(event.error));
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, [language]);

  useEffect(() => {
    const recognition = buildRecognition();
    setIsSupported(recognition !== null);
    recognitionRef.current = recognition;

    return () => {
      if (!recognition) {
        recognitionRef.current = null;
        return;
      }

      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [buildRecognition]);

  const startListening = useCallback(() => {
    if (isListening) {
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = buildRecognition();
      setIsSupported(recognitionRef.current !== null);
    }

    if (!recognitionRef.current) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    setError(null);
    setTranscript("");

    try {
      recognitionRef.current.start();
    } catch {
      setError("Voice input could not start. Check microphone permission and try again.");
    }
  }, [buildRecognition, isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) {
      return;
    }

    recognitionRef.current.stop();
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    error,
    isListening,
    isSupported,
    resetTranscript,
    startListening,
    stopListening,
    transcript,
  };
};