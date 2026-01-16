import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  InputAdornment,
  RadioGroup,
  FormControlLabel,
  Radio,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import {
  SceneInput,
  RenderConfig,
  MusicMoodEnum,
  CaptionPositionEnum,
  OrientationEnum,
  MusicVolumeEnum,
  TransitionEnum,
  CaptionAnimationEnum,
} from "../../types/shorts";

interface SceneFormData {
  text: string;
  searchTerms: string;
}

interface PlexMovie {
  id: string;
  title: string;
  year: number;
}

const VideoCreator: React.FC = () => {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<SceneFormData[]>([
    { text: "", searchTerms: "" },
  ]);
  const [config, setConfig] = useState<RenderConfig>({
    paddingBack: 1500,
    music: MusicMoodEnum.chill,
    captionPosition: CaptionPositionEnum.bottom,
    captionBackgroundColor: "blue",
    voice: "",
    orientation: OrientationEnum.portrait,
    musicVolume: MusicVolumeEnum.high,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<string[]>([]);
  const [musicTags, setMusicTags] = useState<MusicMoodEnum[]>([]);
  const [videoModels, setVideoModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [videoSource, setVideoSource] = useState("pexels");
  const [plexMovies, setPlexMovies] = useState<PlexMovie[]>([]);
  const [selectedPlexMovie, setSelectedPlexMovie] = useState<string | null>(null);
  const [loadingPlexMovies, setLoadingPlexMovies] = useState(false);
  const [plexSearch, setPlexSearch] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [voicesResponse, musicResponse, videoModelsResponse] = await Promise.all([
          axios.get("/api/voices"),
          axios.get("/api/music-tags"),
          axios.get("/api/models/video"),
        ]);
        const fetchedVoices = voicesResponse.data || [];
        setVoices(fetchedVoices);
        setMusicTags(musicResponse.data);
        setVideoModels(videoModelsResponse.data.models || []);
        if (fetchedVoices.length > 0) {
          setConfig((prevConfig) => ({
            ...prevConfig,
            voice: fetchedVoices[0],
          }));
        }
      } catch (err) {
        console.error("Failed to fetch options:", err);
        setError(
          "Failed to load voices and music options. Please refresh the page."
        );
      } finally {
        setLoadingOptions(false);
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    if (videoSource === "plex") {
      fetchPlexMovies();
    }
  }, [videoSource]);

  const fetchPlexMovies = async () => {
    setLoadingPlexMovies(true);
    try {
      const response = await axios.get("/api/plex/movies");
      setPlexMovies(response.data.movies || []);
    } catch (err) {
      setError("Failed to fetch Plex movies.");
      console.error(err);
    } finally {
      setLoadingPlexMovies(false);
    }
  };

  const handleAddScene = () => {
    setScenes([...scenes, { text: "", searchTerms: "" }]);
  };

  const handleRemoveScene = (index: number) => {
    if (scenes.length > 1) {
      const newScenes = [...scenes];
      newScenes.splice(index, 1);
      setScenes(newScenes);
    }
  };

  const handleSceneChange = (
    index: number,
    field: keyof SceneFormData,
    value: string
  ) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], [field]: value };
    setScenes(newScenes);
  };

  const handleConfigChange = (field: keyof RenderConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  const handleSelectPlexMovie = (movieId: string) => {
    setSelectedPlexMovie(movieId);
    setConfig((prevConfig) => ({ ...prevConfig, plexMovieId: movieId }));
  };

  const handleImportJson = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(jsonInput);

      // Validate the JSON structure
      if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error("JSON must contain a 'scenes' array");
      }

      // Convert scenes to form format
      const importedScenes: SceneFormData[] = parsed.scenes.map((scene: any) => ({
        text: scene.text || "",
        searchTerms: Array.isArray(scene.searchTerms)
          ? scene.searchTerms.join(", ")
          : "",
      }));

      setScenes(importedScenes);

      // Import config if present
      if (parsed.config) {
        setConfig((prevConfig) => ({
          ...prevConfig,
          ...parsed.config,
        }));
      }

      setImportDialogOpen(false);
      setJsonInput("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON format");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const apiScenes: SceneInput[] = scenes.map((scene) => ({
        text: scene.text,
        searchTerms: scene.searchTerms
          .split(",")
          .map((term) => term.trim())
          .filter((term) => term.length > 0),
      }));

      const submissionConfig = {
        ...config,
        videoSource: videoSource as "pexels" | "plex",
        plexMovieId: videoSource === 'plex' ? selectedPlexMovie : undefined,
      };

      const response = await axios.post("/api/short-video", {
        scenes: apiScenes,
        config: submissionConfig,
      });

      navigate(`/video/${response.data.videoId}`);
    } catch (err) {
      setError("Failed to create video. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlexMovies = plexMovies.filter(movie => movie.title.toLowerCase().includes(plexSearch.toLowerCase()));

  if (loadingOptions) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="80vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create New Video
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Typography variant="h5" component="h2" gutterBottom>
          Video Source
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <FormControl component="fieldset">
            <RadioGroup
              row
              value={videoSource}
              onChange={(e) => setVideoSource(e.target.value)}
            >
              <FormControlLabel
                value="pexels"
                control={<Radio />}
                label="Pexels (Stock Footage)"
              />
              <FormControlLabel
                value="plex"
                control={<Radio />}
                label="Plex (Your Movies)"
              />
              <FormControlLabel
                value="venice-ai"
                control={<Radio />}
                label="Venice AI (Generated)"
              />
            </RadioGroup>
          </FormControl>
          <Collapse in={videoSource === "plex"}>
            {selectedPlexMovie && !plexSearch ? (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Selected Movie:
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body1">
                    {plexMovies.find(m => m.id === selectedPlexMovie)?.title} ({plexMovies.find(m => m.id === selectedPlexMovie)?.year})
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setSelectedPlexMovie(null)}
                    sx={{ mt: 1 }}
                  >
                    Change Movie
                  </Button>
                </Paper>
              </Box>
            ) : (
              <>
                <TextField
                  fullWidth
                  label="Search Plex Movies"
                  variant="outlined"
                  value={plexSearch}
                  onChange={(e) => setPlexSearch(e.target.value)}
                  sx={{ mt: 2, mb: 2 }}
                />
                {loadingPlexMovies ? (
                  <CircularProgress />
                ) : (
                  <Box sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid #ccc', borderRadius: 1 }}>
                    <List dense>
                      {filteredPlexMovies.map((movie) => (
                        <ListItemButton
                          key={movie.id}
                          selected={selectedPlexMovie === movie.id}
                          onClick={() => {
                            handleSelectPlexMovie(movie.id);
                            setPlexSearch("");
                          }}
                        >
                          <ListItemText primary={`${movie.title} (${movie.year})`} />
                        </ListItemButton>
                      ))}
                    </List>
                  </Box>
                )}
              </>
            )}
          </Collapse>
          <Collapse in={videoSource === "venice-ai"}>
            <Box sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Venice AI Video Model</InputLabel>
                <Select
                  value={config.veniceVideoModel || (videoModels.length > 0 ? videoModels[0].id : "")}
                  onChange={(e) => handleConfigChange("veniceVideoModel", e.target.value)}
                  label="Venice AI Video Model"
                  disabled={videoModels.length === 0}
                >
                  {videoModels.length > 0 ? (
                    videoModels.map((model) => (
                      <MenuItem key={model.id} value={model.id}>
                        {model.name}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem value="">Loading models...</MenuItem>
                  )}
                </Select>
              </FormControl>
            </Box>
          </Collapse>
        </Paper>

        <Typography variant="h5" component="h2" gutterBottom>
          Scenes
        </Typography>

        {scenes.map((scene, index) => (
          <Paper key={index} sx={{ p: 3, mb: 3 }}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6">Scene {index + 1}</Typography>
              {scenes.length > 1 && (
                <IconButton
                  onClick={() => handleRemoveScene(index)}
                  color="error"
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              )}
            </Box>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Text"
                  multiline
                  rows={4}
                  value={scene.text}
                  onChange={(e) =>
                    handleSceneChange(index, "text", e.target.value)
                  }
                  required
                />
              </Grid>
              {videoSource === 'pexels' && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Search Terms (comma-separated)"
                    value={scene.searchTerms}
                    onChange={(e) =>
                      handleSceneChange(index, "searchTerms", e.target.value)
                    }
                    helperText="Enter keywords for background video, separated by commas"
                    required
                  />
                </Grid>
              )}
            </Grid>
          </Paper>
        ))}

        <Box display="flex" justifyContent="center" gap={2} mb={4}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddScene}
          >
            Add Scene
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileUploadIcon />}
            onClick={() => setImportDialogOpen(true)}
          >
            Import JSON
          </Button>
        </Box>

        <Divider sx={{ mb: 4 }} />

        <Typography variant="h5" component="h2" gutterBottom>
          Video Configuration
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="End Screen Padding (ms)"
                value={config.paddingBack}
                onChange={(e) =>
                  handleConfigChange("paddingBack", parseInt(e.target.value))
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">ms</InputAdornment>
                  ),
                }}
                helperText="Duration to keep playing after narration ends"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Music Mood</InputLabel>
                <Select
                  value={config.music}
                  onChange={(e) => handleConfigChange("music", e.target.value)}
                  label="Music Mood"
                  required
                >
                  {Object.values(MusicMoodEnum).map((tag) => (
                    <MenuItem key={tag} value={tag}>
                      {tag}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Caption Position</InputLabel>
                <Select
                  value={config.captionPosition}
                  onChange={(e) =>
                    handleConfigChange("captionPosition", e.target.value)
                  }
                  label="Caption Position"
                  required
                >
                  {Object.values(CaptionPositionEnum).map((position) => (
                    <MenuItem key={position} value={position}>
                      {position}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Caption Background Color"
                value={config.captionBackgroundColor}
                onChange={(e) =>
                  handleConfigChange("captionBackgroundColor", e.target.value)
                }
                helperText="Any valid CSS color (name, hex, rgba)"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Default Voice</InputLabel>
                <Select
                  value={config.voice}
                  onChange={(e) => handleConfigChange("voice", e.target.value)}
                  label="Default Voice"
                  required
                >
                  {voices.map((voice) => (
                    <MenuItem key={voice} value={voice}>
                      {voice}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Orientation</InputLabel>
                <Select
                  value={config.orientation}
                  onChange={(e) =>
                    handleConfigChange("orientation", e.target.value)
                  }
                  label="Orientation"
                  required
                >
                  {Object.values(OrientationEnum).map((orientation) => (
                    <MenuItem key={orientation} value={orientation}>
                      {orientation}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Volume of the background audio</InputLabel>
                <Select
                  value={config.musicVolume}
                  onChange={(e) =>
                    handleConfigChange("musicVolume", e.target.value)
                  }
                  label="Volume of the background audio"
                  required
                >
                  {Object.values(MusicVolumeEnum).map((voice) => (
                    <MenuItem key={voice} value={voice}>
                      {voice}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* New Enhancement Fields */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  AI & Visual Enhancements
                </Typography>
              </Divider>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Transition Effect</InputLabel>
                <Select
                  value={config.transition || TransitionEnum.none}
                  onChange={(e) => handleConfigChange("transition", e.target.value)}
                  label="Transition Effect"
                >
                  {Object.values(TransitionEnum).map((transition) => (
                    <MenuItem key={transition} value={transition}>
                      {transition}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Caption Animation</InputLabel>
                <Select
                  value={config.captionAnimation || CaptionAnimationEnum.none}
                  onChange={(e) => handleConfigChange("captionAnimation", e.target.value)}
                  label="Caption Animation"
                >
                  {Object.values(CaptionAnimationEnum).map((animation) => (
                    <MenuItem key={animation} value={animation}>
                      {animation}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="TTS Speed"
                value={config.ttsSpeed || 1.0}
                onChange={(e) => handleConfigChange("ttsSpeed", parseFloat(e.target.value))}
                inputProps={{ min: 0.25, max: 4.0, step: 0.25 }}
                helperText="Speech speed (0.25x - 4.0x)"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Ken Burns Effect</InputLabel>
                <Select
                  value={config.kenBurnsEffect ? "true" : "false"}
                  onChange={(e) => handleConfigChange("kenBurnsEffect", e.target.value === "true")}
                  label="Ken Burns Effect"
                >
                  <MenuItem value="false">Disabled</MenuItem>
                  <MenuItem value="true">Enabled (Zoom & Pan)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        <Box display="flex" justifyContent="center">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={loading || (videoSource === "plex" && !selectedPlexMovie)}
            sx={{ minWidth: 200 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Create Video"
            )}
          </Button>
        </Box>
      </form>

      {/* Import JSON Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => {
          setImportDialogOpen(false);
          setJsonInput("");
          setImportError(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Import JSON</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Paste your JSON with scenes and config. Expected format:
          </Typography>
          <Typography
            variant="caption"
            component="pre"
            sx={{
              backgroundColor: "grey.100",
              p: 1,
              borderRadius: 1,
              mb: 2,
              fontSize: "0.75rem",
              overflow: "auto",
            }}
          >
            {`{
  "scenes": [
    {
      "text": "Scene text",
      "searchTerms": ["term1", "term2"]
    }
  ],
  "config": {
    "orientation": "portrait"
  }
}`}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste JSON here..."
            variant="outlined"
            sx={{ fontFamily: "monospace" }}
          />
          {importError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {importError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportDialogOpen(false);
              setJsonInput("");
              setImportError(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleImportJson} variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VideoCreator;
