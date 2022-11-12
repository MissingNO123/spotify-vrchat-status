const SpotifyWebApi = require("spotify-web-api-node");
const express = require("express");
const readline = require("readline");
const EventEmitter = require("events");
const eventEmitter = new EventEmitter();
const osc = require('osc');

const config = require("./config.json");

// change these to whatever you have set for vrchat
const vrcInPort = 9000
const vrcOutPort = 9001
const localAddress = 'localhost';  // Your PC's IP address, if not using Quest this should be 127.0.0.1
const remoteAddress = '127.0.0.1'; // Your Quest's IP address, if not using Quest leave this as 127.0.0.1
const localPort = 11037;

var isSpotified = false;
var isOSCPorted = false;

var lastPlayStr = "";

// Create an osc.js UDP Port.
var vrcOscUdpPort = new osc.UDPPort({
  localAddress: localAddress,
  localPort: localPort, 
  metadata: false
});

// Open the osc socket.
vrcOscUdpPort.open();

// wait for udp port to be ready before using it
vrcOscUdpPort.on("ready", function () {
  isOSCPorted = true;
  console.log("Connected to OSC UDP at " + localAddress + " on port " + localPort);
  // Send typing indicator
  vrcOscUdpPort.send({
    address: "/chatbox/typing",
    args: [
        {
            type: "i",
            value: 1
        }
    ]
  }, localAddress, vrcInPort);
});

const spotifyApi = new SpotifyWebApi({
  redirectUri: "http://localhost:8888/callback",
  clientId: config.clientId,
  clientSecret: config.clientSecret
});

// Refresh Spotify's tokens
function refreshToken() {
  spotifyApi.refreshAccessToken()
    .then(data => {
      const expires_in = data.body["expires_in"];
      spotifyApi.setAccessToken(data.body["access_token"]);
      isSpotified = true;
      eventEmitter.emit("spotify_ready");
      console.log( `Refreshed Spotify access token. It now expires in ${expires_in} seconds!` );
      setTimeout(refreshToken, (expires_in / 2) * 1000);
      isSpotified = true;
    },
    function (err) {
      console.log("Could not refresh the Spotify token!", err.message);
      isSpotified = false;
    }
  );
}

// Update current playing song from Spotify, set it as chatbox text
function updateSpotPlayingStatus() {
  if (!isSpotified) return;
  if (!isOSCPorted) return;
  // Get the User's Currently Playing Track 
  spotifyApi.getMyCurrentPlayingTrack()
    .then(function (data) {
      if (data.body.item == null || data.body.item == undefined) { return; } // Nothing playing yet

      //let nameFilter = /[\u0081-\uFFFF]/g; 
      //let songName = data.body.item.name.replace(nameFilter, "?"); //chatbox (used to) only support ASCII 
      let songName = data.body.item.name;
      let playPaused = data.body.is_playing == true ? "[>] " : "[||] ";
      let artistArr = [];
      for (a in data.body.item.artists) artistArr.push(data.body.item.artists[a].name);
      let artistNames = artistArr.join(", ");

      let progBarLength = 26;
      let progScaled = Math.floor(data.body.progress_ms / data.body.item.duration_ms * progBarLength);
      // [============O============]
      let progStr = "[" .padEnd(progScaled, '=') + 'O' .padEnd(progBarLength-progScaled - (progScaled==0), '=') + ']';

      try {
        let playStr = `${playPaused} '${songName}' by '${artistNames}' `; 
        let statusStr = playStr;
        if (statusStr.length > 115) { statusStr = statusStr.slice(0,110) + "... "; } // Truncate if too long 
        statusStr += progStr;
        statusStr.toString()
        //console.log(statusStr);
        if (statusStr !== lastPlayStr) {
          setChatBox(toUTF8(statusStr));
          lastPlayStr = statusStr;
        }
      } catch (e) {
        console.log("Could not update playing status: " + e);
      }
    }, 
    function (err) {
      console.log("updateSpotPlayingStatus: Something went wrong!", err);
      isSpotified = false;
      refreshToken();
    });
}

// Creates a mini webapp to handle generating Spotify access tokens
// TODO: Save authentication token so don't have to login each time
const app = express();

const scopes = [
  "user-read-playback-state",
  "user-read-currently-playing",
];

app.get("/login", (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get("/callback", (req, res) => {
  const error = req.query.error;
  const code = req.query.code;
  const state = req.query.state;

  if (error) {
    console.error("Callback Error:", error);
    res.send(`Callback Error: ${error}`);
    return;
  }

  spotifyApi
    .authorizationCodeGrant(code)
    .then(data => {
      const expires_in = data.body["expires_in"];

      spotifyApi.setAccessToken(data.body["access_token"]);
      spotifyApi.setRefreshToken(data.body["refresh_token"]);

      console.log( `Sucessfully retreived access token. Expires in ${expires_in} seconds.` );

      res.send("Success! You can now close the window. ");

      isSpotified = true;
      eventEmitter.emit("spotify_ready");

      setTimeout(refreshToken, (expires_in / 2) * 1000);
    })
    .catch(error => {
      console.error("Error getting Tokens:", error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

// Chatbox supports UTF-8 now!
function toUTF8(str) {return Buffer.from(str, "utf-8").toString();}

// Chatbox setter helper function
function setChatBox(string) {
  vrcOscUdpPort.send({
      address: "/chatbox/input",
      args: [
          {
              type: "s", // chatbox text itself
              value: string
          },
          {
              type: "i", // don't open keyboard (post straight to chatbox)
              value: 1
          },
          {
            type: "b", // don't play notification sound
            value: new Uint8Array([0x00]) // I HATE VRCHAT
          },
      ]
  }, localAddress, vrcInPort);
}

// Wait until Spotify is ready
async function WaitForReady() {
  await new Promise(resolve => eventEmitter.once('spotify_ready', resolve));
  console.log("Spotify is ready");
  eventEmitter.emit('ready');
}
WaitForReady();

// Start the webapp server for Spotify tokens
app.listen(8888, () => {
  require('child_process').exec('start http://localhost:8888/login'); // sorry
});

// Begin update loop once everything is ready
eventEmitter.once("ready", () => {
  console.log("Everything is ready!");
  updateSpotPlayingStatus();
  setInterval(updateSpotPlayingStatus, 2e3);
})
