import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  Toolbar,
  Typography,
  Button,
  ThemeProvider,
  createTheme
} from '@mui/material';
import VideoIcon from '@mui/icons-material/VideoLibrary';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

interface LayoutProps {
  children: React.ReactNode;
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#f50057',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="static">
          <Toolbar>
            <VideoIcon sx={{ mr: 2 }} />
            <Typography
              variant="h6"
              component="div"
              sx={{ flexGrow: 1, cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Short Video Maker
            </Typography>
            <Button
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ opacity: location.pathname === '/' ? 1 : 0.7 }}
            >
              Videos
            </Button>
            <Button
              color="inherit"
              startIcon={<AddIcon />}
              onClick={() => navigate('/create')}
              sx={{ opacity: location.pathname === '/create' ? 1 : 0.7 }}
            >
              Create
            </Button>
            <Button
              color="inherit"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => navigate('/ai-tools')}
              sx={{ opacity: location.pathname === '/ai-tools' ? 1 : 0.7 }}
            >
              AI Tools
            </Button>
            <Button
              color="inherit"
              startIcon={<SettingsIcon />}
              onClick={() => navigate('/settings')}
              sx={{ opacity: location.pathname === '/settings' ? 1 : 0.7 }}
            >
              Settings
            </Button>
          </Toolbar>
        </AppBar>
        <Container component="main" sx={{ flexGrow: 1, py: 4 }}>
          {children}
        </Container>
        <Box
          component="footer"
          sx={{
            py: 3,
            mt: 'auto',
            backgroundColor: (theme) => theme.palette.grey[200],
            textAlign: 'center'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Short Video Maker &copy; {new Date().getFullYear()}
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default Layout;
