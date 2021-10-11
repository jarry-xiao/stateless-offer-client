import React, { useEffect } from "react";
import "./App.css";
import Header from "./components/Header/Header";
import { TransferBox } from "./components";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useColorMode } from "./contexts";
import { Box } from "@mui/material";

function App() {
  const colorModeCtx = useColorMode();

  const mode =
    colorModeCtx.mode === "dark" || !colorModeCtx.mode ? "dark" : "light";

  useEffect(() => {}, [colorModeCtx.mode]);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [colorModeCtx.mode]
  );

  return (
    <div className="App" style={{ backgroundColor: "transparent" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Header />
        <Box
          sx={{
            marginTop: "15%",
            width: 600,
            px: "50%",
            display: "flex",
            alignSelf: "center",
            justifyContent: "center",
            alignContent: "center",
          }}
        >
          <TransferBox />
        </Box>
      </ThemeProvider>
    </div>
  );
}

export default App;
