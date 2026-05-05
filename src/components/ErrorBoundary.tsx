import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary que captura errores de React y los envía a Sentry
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('❌ Error capturado por ErrorBoundary:', error);
    console.error('📍 Error info:', errorInfo);

    console.error('ComponentStack:', errorInfo.componentStack);
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Si hay fallback customizado, usarlo
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      // UI de fallback por defecto
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.emoji}>😵</Text>
            <Text style={styles.title}>Algo salió mal</Text>
            <Text style={styles.description}>
              La aplicación encontró un error inesperado.
              Nuestro equipo ha sido notificado.
            </Text>

            {__DEV__ && (
              <ScrollView style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {this.state.error.name}: {this.state.error.message}
                </Text>
                <Text style={styles.errorStack}>
                  {this.state.error.stack}
                </Text>
              </ScrollView>
            )}

            <Pressable
              style={styles.button}
              onPress={this.resetError}
            >
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emoji: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    maxHeight: 200,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: '#DC2626',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});