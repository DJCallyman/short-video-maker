import React, { useState } from 'react';
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
  Card,
  CardContent,
  CardHeader,
  Chip,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Slider,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface GeneratedScene {
  text: string;
  searchTerms: string[];
}

const AITools: React.FC = () => {
  // Script Generation State
  const [scriptTopic, setScriptTopic] = useState('');
  const [scriptDuration, setScriptDuration] = useState(30);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScene[]>([]);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  // Search Terms State
  const [searchText, setSearchText] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Voice Preview State
  const [voiceText, setVoiceText] = useState('Hello! This is a voice preview.');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleGenerateScript = async () => {
    try {
      setScriptLoading(true);
      setScriptError(null);

      const response = await axios.post('/api/ai/generate-script', {
        topic: scriptTopic,
        duration: scriptDuration,
      });

      setGeneratedScript(response.data.script);
    } catch (err: any) {
      setScriptError(err.response?.data?.message || 'Failed to generate script');
      console.error(err);
    } finally {
      setScriptLoading(false);
    }
  };

  const handleGenerateSearchTerms = async () => {
    try {
      setSearchLoading(true);
      setSearchError(null);

      const response = await axios.post('/api/ai/generate-search-terms', {
        text: searchText,
      });

      setSearchTerms(response.data.searchTerms);
    } catch (err: any) {
      setSearchError(err.response?.data?.message || 'Failed to generate search terms');
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleVoicePreview = async () => {
    try {
      setVoiceLoading(true);
      setVoiceError(null);

      // Revoke previous audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const response = await axios.post('/api/voices/preview', {
        voice: selectedVoice,
        text: voiceText,
        speed: voiceSpeed,
      }, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(response.data);
      setAudioUrl(url);

      // Auto-play
      const audio = new Audio(url);
      audio.play();
    } catch (err: any) {
      setVoiceError('Failed to generate voice preview');
      console.error(err);
    } finally {
      setVoiceLoading(false);
    }
  };

  const copyScriptToClipboard = async () => {
    const scriptText = JSON.stringify({
      scenes: generatedScript,
      config: { orientation: 'portrait' }
    }, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(scriptText);
        // Optional: Show success message
      } catch (error) {
        console.error('Copy failed:', error);
        // Optional: Fallback or error handling
      }
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = scriptText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        // Optional: Show success message
      } catch (error) {
        console.error('Fallback copy failed:', error);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <Box maxWidth="1200px" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        AI Tools
      </Typography>

      <Grid container spacing={3}>
        {/* Script Generation */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="AI Script Generator"
              avatar={<AutoAwesomeIcon />}
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Video Topic"
                    value={scriptTopic}
                    onChange={(e) => setScriptTopic(e.target.value)}
                    placeholder="e.g., The future of renewable energy"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography gutterBottom>
                    Duration: {scriptDuration} seconds
                  </Typography>
                  <Slider
                    value={scriptDuration}
                    onChange={(_, value) => setScriptDuration(value as number)}
                    min={15}
                    max={60}
                    step={5}
                    marks
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleGenerateScript}
                    disabled={scriptLoading || !scriptTopic}
                    startIcon={scriptLoading ? <CircularProgress size={20} /> : <AutoAwesomeIcon />}
                  >
                    {scriptLoading ? 'Generating...' : 'Generate Script'}
                  </Button>
                </Grid>

                {scriptError && (
                  <Grid item xs={12}>
                    <Alert severity="error">{scriptError}</Alert>
                  </Grid>
                )}

                {generatedScript.length > 0 && (
                  <Grid item xs={12}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle2">Generated Script ({generatedScript.length} scenes)</Typography>
                      <IconButton size="small" onClick={copyScriptToClipboard} title="Copy to clipboard">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto', p: 2 }}>
                      <List dense>
                        {generatedScript.slice(0, 5).map((scene, idx) => (
                          <ListItem key={idx}>
                            <ListItemText
                              primary={`Scene ${idx + 1}: ${scene.text}`}
                              secondary={
                                <Box mt={0.5}>
                                  {scene.searchTerms.map((term, i) => (
                                    <Chip key={i} label={term} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                  ))}
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                        {generatedScript.length > 5 && (
                          <Typography variant="caption" sx={{ pl: 2 }}>
                            ... and {generatedScript.length - 5} more scenes
                          </Typography>
                        )}
                      </List>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Search Terms Generator */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Search Terms Generator"
              avatar={<AutoAwesomeIcon />}
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Scene Text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Enter the narration text for your scene"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleGenerateSearchTerms}
                    disabled={searchLoading || !searchText}
                    startIcon={searchLoading ? <CircularProgress size={20} /> : <AutoAwesomeIcon />}
                  >
                    {searchLoading ? 'Generating...' : 'Generate Search Terms'}
                  </Button>
                </Grid>

                {searchError && (
                  <Grid item xs={12}>
                    <Alert severity="error">{searchError}</Alert>
                  </Grid>
                )}

                {searchTerms.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>Search Terms:</Typography>
                    <Box>
                      {searchTerms.map((term, idx) => (
                        <Chip key={idx} label={term} sx={{ mr: 1, mb: 1 }} />
                      ))}
                    </Box>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Voice Preview */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title="Voice Preview"
              avatar={<RecordVoiceOverIcon />}
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Voice"
                    select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    SelectProps={{ native: true }}
                  >
                    <option value="af_bella">Bella (Female)</option>
                    <option value="af_heart">Heart (Female)</option>
                    <option value="af_nicole">Nicole (Female)</option>
                    <option value="af_sarah">Sarah (Female)</option>
                    <option value="am_adam">Adam (Male)</option>
                    <option value="am_michael">Michael (Male)</option>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Speed: {voiceSpeed}x</Typography>
                  <Slider
                    value={voiceSpeed}
                    onChange={(_, value) => setVoiceSpeed(value as number)}
                    min={0.25}
                    max={4.0}
                    step={0.25}
                    marks={[
                      { value: 0.5, label: '0.5x' },
                      { value: 1, label: '1x' },
                      { value: 2, label: '2x' },
                      { value: 4, label: '4x' },
                    ]}
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Preview Text"
                    value={voiceText}
                    onChange={(e) => setVoiceText(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVoicePreview}
                    disabled={voiceLoading || !voiceText}
                    startIcon={voiceLoading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  >
                    {voiceLoading ? 'Generating...' : 'Preview Voice'}
                  </Button>
                </Grid>

                {voiceError && (
                  <Grid item xs={12}>
                    <Alert severity="error">{voiceError}</Alert>
                  </Grid>
                )}

                {audioUrl && (
                  <Grid item xs={12}>
                    <Alert severity="success">
                      Voice preview generated!
                      <Button size="small" onClick={() => new Audio(audioUrl).play()} sx={{ ml: 1 }}>
                        Play Again
                      </Button>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AITools;
