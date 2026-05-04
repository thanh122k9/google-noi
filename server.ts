import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";
import * as googleTTS from "google-tts-api";
import dotenv from "dotenv";

dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  let tiktokConnection: TikTokLiveConnection | null = null;

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("connect-tiktok", (uniqueId) => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
      }

      tiktokConnection = new TikTokLiveConnection(uniqueId, {
        signApiKey: "euler_ZTVjZGViYzBhMzliYWZiNWJlNTgwODIzNzBmOTI3YTViZjgwMDVkYmE0YTZhYjJiOWNjZTdk"
      });

      tiktokConnection.connect().then(state => {
        console.log(`Connected to roomId ${state.roomId}`);
        socket.emit("tiktok-status", { status: "connected", roomId: state.roomId });
      }).catch(err => {
        console.error("Failed to connect", err);
        let errorMessage = err.message;
        if (err.constructor.name === 'FetchIsLiveError' || err.constructor.name === 'UserOfflineError' || (err.errors && err.errors.length > 0)) {
          errorMessage = "User not found or offline. Please check the username and try again.";
        }
        socket.emit("tiktok-status", { status: "error", message: errorMessage || "Failed to connect to TikTok Live" });
      });

      tiktokConnection.on(WebcastEvent.CHAT, data => {
        socket.emit("tiktok-chat", data);
      });

      tiktokConnection.on(WebcastEvent.GIFT, data => {
        socket.emit("tiktok-gift", data);
      });

      tiktokConnection.on(WebcastEvent.LIKE, data => {
        socket.emit("tiktok-like", data);
      });

      tiktokConnection.on(WebcastEvent.MEMBER, data => {
        socket.emit("tiktok-member", data);
      });

      tiktokConnection.on(WebcastEvent.ROOM_USER, data => {
        socket.emit("tiktok-roomUser", data);
      });

      tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
        socket.emit("tiktok-status", { status: "disconnected" });
      });

      tiktokConnection.on(ControlEvent.ERROR, (err) => {
        socket.emit("tiktok-status", { status: "error", message: err.message });
      });
    });

    socket.on("disconnect-tiktok", () => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
        tiktokConnection = null;
        socket.emit("tiktok-status", { status: "disconnected" });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
      if (tiktokConnection) {
        tiktokConnection.disconnect();
        tiktokConnection = null;
      }
    });
  });

  // TTS Proxy to solve browser blocking Google Translate audio directly
  app.get('/api/tts', async (req: any, res: any) => {
    try {
      const text = req.query.text;
      if (!text || typeof text !== 'string') {
        return res.status(400).send('No text provided');
      }
      
      const base64Audio = await googleTTS.getAudioBase64(text, {
        lang: 'vi',
        slow: false,
        host: 'https://translate.google.com',
      });
      
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      res.send(audioBuffer);
    } catch (error) {
      console.error('TTS Proxy Error:', error);
      res.status(500).send('TTS Proxy Error');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
