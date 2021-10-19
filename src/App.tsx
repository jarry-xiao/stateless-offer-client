import React, { useEffect, useState } from "react";
import "./App.css";
import Header from "./components/Header/Header";
import { TransferBox } from "./components";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useColorMode } from "./contexts";
import { Box } from "@mui/material";

const getWindowDimensions = () => {
  const { innerWidth: width, innerHeight: height } = window;
  return {
    width,
    height,
  };
};

const useWindowDimensions = () => {
  const [windowDimensions, setWindowDimensions] = useState(
    getWindowDimensions()
  );

  useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
};

function App() {
  const colorModeCtx = useColorMode();

  const mode =
    colorModeCtx.mode === "dark" || !colorModeCtx.mode ? "dark" : "light";

  const { height } = useWindowDimensions();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode]
  );

  return (
    <div
      className="App"
      style={{ position: "relative", backgroundColor: "transparent", height: "100%" }}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Header />
        <Box
          sx={{
            width: 600,
            flexGrow: 1,
            mt: `${Math.floor(0.2 * height)}px`,
            px: "50%",
            display: "flex",
            alignSelf: "center",
            justifyContent: "center",
            alignContent: "center",
          }}
        >
          <TransferBox />
        </Box>
        <Box
          sx={{
            alignItems: "flex-end",
            display: "flex",
            maxWidth: "200ch",
            position: "absolute",
            marginLeft: "auto",
            marginRight: "auto",
            left: 0,
            right: 0,
            bottom: 0,
            textAlign: "left",
            padding: "20px"
          }}
          fontSize={11}
        >
          *This page was produced by the Solana Foundation ("SF") for internal
          educational and inspiration purposes only. SF does not encourage,
          induce or sanction the deployment, integration or use of Oyster or any
          similar application (including its code) in violation of applicable
          laws or regulations and hereby prohibits any such deployment,
          integration or use. Anyone using this code or a derivation thereof
          must comply with applicable laws and regulations when releasing
          related software.
        </Box>
      </ThemeProvider>
    </div>
  );
}

export default App;
