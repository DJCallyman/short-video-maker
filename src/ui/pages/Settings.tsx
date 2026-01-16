import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Alert,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardHeader,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';

interface Settings {
  veniceApiKey?: string;
  veniceChatModel?: string;
  ttsProvider?: string;
  transcriptionProvider?: string;
  pexelsApiKey?: string;
}

interface ChatModel {
  id: string;
  name: string;
  supportsResponseSchema?: boolean;
  supportsFunctionCalling?: boolean;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [filterResponseSchema, setFilterResponseSchema] = useState(false);
  const [filterFunctionCalling, setFilterFunctionCalling] = useState(false);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchChatModels()]);
  }, []);

  const fetchChatModels = async () => {
    try {
      const response = await axios.get('/api/models/chat');
      setChatModels(response.data.models);
    } catch (err) {
      console.error('Failed to load chat models:', err);
      // Fallback to default models if fetch fails
      setChatModels([
        { id: "llama-3.3-70b", name: "Llama 3.3 70B", supportsResponseSchema: true, supportsFunctionCalling: false },
        { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", supportsResponseSchema: true, supportsFunctionCalling: true },
      ]);
    }
  };

  const getFilteredModels = () => {
    return chatModels.filter((model) => {
      if (filterResponseSchema && !model.supportsResponseSchema) return false;
      if (filterFunctionCalling && !model.supportsFunctionCalling) return false;
      return true;
    });
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings');
      setSettings(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await axios.put('/api/settings', settings);
      setSettings(response.data);
      setSuccess('Settings saved successfully!');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await axios.post('/api/settings/reset', {});
      setSettings(response.data);
      setSuccess('Settings reset to defaults!');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to reset settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="800px" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Venice AI Settings */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Venice AI Configuration" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Venice API Key"
                    type="password"
                    value={settings.veniceApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, veniceApiKey: e.target.value })}
                    helperText="Your Venice AI API key for TTS, video generation, and chat"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Filter Models by Capabilities
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        id="responseSchema"
                        checked={filterResponseSchema}
                        onChange={(e) => setFilterResponseSchema(e.target.checked)}
                      />
                      <label htmlFor="responseSchema" style={{ marginLeft: 8, cursor: 'pointer' }}>
                        Structured Responses
                      </label>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        id="functionCalling"
                        checked={filterFunctionCalling}
                        onChange={(e) => setFilterFunctionCalling(e.target.checked)}
                      />
                      <label htmlFor="functionCalling" style={{ marginLeft: 8, cursor: 'pointer' }}>
                        Function Calling
                      </label>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Chat Model</InputLabel>
                    <Select
                      value={settings.veniceChatModel || 'llama-3.3-70b'}
                      onChange={(e) => setSettings({ ...settings, veniceChatModel: e.target.value })}
                      renderValue={(value) => {
                        const model = chatModels.find(m => m.id === value);
                        return model ? model.name : value;
                      }}
                    >
                      {getFilteredModels().map((model) => (
                        <MenuItem key={model.id} value={model.id}>
                          {model.name}
                          {model.supportsResponseSchema && ' ✓'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Provider Settings */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Service Providers" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>TTS Provider</InputLabel>
                    <Select
                      value={settings.ttsProvider || 'venice'}
                      onChange={(e) => setSettings({ ...settings, ttsProvider: e.target.value })}
                    >
                      <MenuItem value="venice">Venice AI (Kokoro)</MenuItem>
                      <MenuItem value="kokoro">Kokoro (Local)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Transcription Provider</InputLabel>
                    <Select
                      value={settings.transcriptionProvider || 'whisper'}
                      onChange={(e) => setSettings({ ...settings, transcriptionProvider: e.target.value })}
                    >
                      <MenuItem value="whisper">Whisper (Local)</MenuItem>
                      <MenuItem value="venice">Venice AI</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Pexels Settings */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Stock Footage" />
            <CardContent>
              <TextField
                fullWidth
                label="Pexels API Key"
                type="password"
                value={settings.pexelsApiKey || ''}
                onChange={(e) => setSettings({ ...settings, pexelsApiKey: e.target.value })}
                helperText="API key for Pexels stock video footage"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Action Buttons */}
        <Grid item xs={12}>
          <Box display="flex" gap={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={saving}
              startIcon={<RefreshIcon />}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings;
