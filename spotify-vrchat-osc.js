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
const ipAddress = '127.0.0.1';

// Create an osc.js UDP Port.
var vrcOscUdpPort = new osc.UDPPort({
  localAddress: ipAddress,
  localPort: vrcOutPort,
  metadata: true
});

// Open the osc socket.
vrcOscUdpPort.open();

var isSpotified = false;
var isOSCPorted = false;

// wait for udp port to be ready before using it
vrcOscUdpPort.on("ready", function () {
  isOSCPorted = true;
  console.log("Connected to OSC UDP at " + ipAddress + " on port " + vrcOutPort);
  //send typing indicator
  vrcOscUdpPort.send({
    address: "/chatbox/typing",
    args: [
        {
            type: "i",
            value: 1
        }
    ]
  }, ipAddress, vrcInPort);
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
      const access_token = data.body["access_token"];
      const refresh_token = data.body["refresh_token"];
      const expires_in = data.body["expires_in"];
      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);
      isSpotified = true;
      eventEmitter.emit("spotify_ready");
      console.log( `Refreshed Spotify token. It now expires in ${expires_in} seconds!` );
      setTimeout(refreshToken, data.body["expires_in"] / 2e3);
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

      let nameFilter = /[\u0081-\uFFFF]/g; 
      let songName = data.body.item.name.replace(nameFilter, "?"); //chatbox only supports ASCII for now 
      let playPaused = data.body.is_playing == true ? "[>]Listening to: " : "[||]Paused: ";
      let artistArr = [];
      for (a in data.body.item.artists) artistArr.push(data.body.item.artists[a].name);
      let artistNames = artistArr.join(", ");

      let progBarLength = 26;
      let progScaled = Math.floor(data.body.progress_ms / data.body.item.duration_ms * progBarLength);
      // [============O============]
      let progStr = "[" .padEnd(progScaled, '=') + 'O' .padEnd(progBarLength-progScaled - (progScaled==0), '=') + ']';

      try {
        let playStr = `${playPaused} ${songName} by ${artistNames} `; 
        let statusStr = playStr;
        if (playStr.length > 115) { statusStr = playStr.slice(0,111) + "..."; } // Truncate if too long 
        playStr = playStr + progStr;
        console.log(playStr);
        setChatBox(playStr);
      } catch (e) {
        console.log("Could not update playing status: " + e);
      }
    }, 
    function (err) {
      console.log("updateSpotify: Something went wrong!", err);
      isSpotified = false;
      refreshToken();
      //require('child_process').exec('start http://localhost:8888/login');
    });
}

// Create mini webapp to handle generating Spotify access tokens
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
      const access_token = data.body["access_token"];
      const refresh_token = data.body["refresh_token"];
      const expires_in = data.body["expires_in"];

      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      console.log( `Sucessfully retreived access token. Expires in ${expires_in} s.` );

      res.send("Success! You can now close the window.");

      isSpotified = true;
      eventEmitter.emit("spotify_ready");

      setTimeout(refreshToken, expires_in / 2 * 1000);
    })
    .catch(error => {
      console.error("Error getting Tokens:", error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

function setChatBox(string) {
  vrcOscUdpPort.send({
      address: "/chatbox/input",
      args: [
          {
              type: "s",
              value: string
          },
          {
              type: "i",
              value: 1
          }
      ]
  }, ipAddress, vrcInPort);
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

eventEmitter.once("ready", () => {
  console.log("Everything is ready!");
  updateSpotPlayingStatus();
  setInterval(updateSpotPlayingStatus, 5e3);
})
