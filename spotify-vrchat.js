const SpotifyWebApi = require("spotify-web-api-node");
const express = require("express");
const readline = require("readline");
const vrchat = require("vrchat");
const EventEmitter = require("events");
const eventEmitter = new EventEmitter();

const config = require("./config.json");

const scopes = [
  "user-read-playback-state",
  "user-read-currently-playing",
];

var isSpotified = false;
var isVRChat = false; 

const spotifyApi = new SpotifyWebApi({
  redirectUri: "http://localhost:8888/callback",
  clientId: config.clientId,
  clientSecret: config.clientSecret
});

let VRCCurrentUser;
let AuthenticationApi;
let UsersApi;

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

// Update current playing song from Spotify, set it as VRC status
let lastPlayStr = "";
function updateSpotPlayingStatus() {
  if (!isSpotified) return;
  if (!isVRChat) return;
  if (UsersApi == undefined) return;
  // Get the User's Currently Playing Track 
  spotifyApi.getMyCurrentPlayingTrack()
    .then(function (data) {
      if (data.body.item == null || data.body.item == undefined) { return; } // Nothing playing yet
      let artists = [];
      try {
        for (a in data.body.item.artists) artists.push(data.body.item.artists[a].name);
        let playStr = data.body.item.name + "-" + artists.join(", "); // Comma separate list
        if (playStr !== lastPlayStr) { // Don't update again if the same
          console.log("Now playing: " + playStr);
          let statusStr = playStr;
          if (playStr.length > 30) { statusStr = playStr.slice(0,28) + "..."; } // Truncate if too long
          UsersApi.updateUser(VRCCurrentUser.id, {"statusDescription": ">"+statusStr});
          lastPlayStr = playStr;
        }
      } catch (e) {
        console.log("Could not update playing status: " + e);
      }
    }, function (err) {
      console.log("updateSpotify: Something went wrong!", err);
      isSpotified = false;
      refreshToken();
    });
}

// Create mini webapp to handle generating Spotify access tokens
const app = express();

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

      res.send("Success! You can now close the window. <script>Window.close();</script>");

      isSpotified = true;
      eventEmitter.emit("spotify_ready");

      setTimeout(refreshToken, expires_in / 2 * 1000);
    })
    .catch(error => {
      console.error("Error getting Tokens:", error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

// Prompts for input, Python style
function prompt(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    
    rl.close();
    resolve(ans);
  }))
}

// Prompts for input but masks it
function passwordEntry(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl._writeToOutput(query);
  rl._writeToOutput = function _writeToOutput(stringToWrite) { rl.output.write("*"); }

  return new Promise(resolve => {
    rl.question(query, ans => {
      rl.history = rl.history.slice(1);
      rl.close();
      resolve(ans);
    });
  });
}

// Handle authenticating with VRChat API
const VRCLoginFlow = async function() {
let VRCUsername = await prompt("VRC Username: ");
let VRCPassword = await passwordEntry("VRC Password: ");
const configuration = new vrchat.Configuration({
  username: VRCUsername,
  password: VRCPassword
});
  AuthenticationApi = new vrchat.AuthenticationApi(configuration);
  UsersApi = new vrchat.UsersApi(configuration);
  AuthenticationApi.getCurrentUser().then(async resp => {
    if (resp.data.requiresTwoFactorAuth != undefined) {  
      let twoFactorAuthCode = await prompt("Enter 2FA: ");
      await AuthenticationApi.verify2FA( {'code': twoFactorAuthCode} ).then(async resp2 => { // weird hack to get vrchat module to work properly, sending a string gives HTTP 400
        await AuthenticationApi.getCurrentUser().then(async resp3 => {VRCCurrentUser = resp3.data;});
      });
    } else {
      VRCCurrentUser = resp.data;
    }
    console.log(`Logged in as: ${VRCCurrentUser.username}`);
    isVRChat = true;
    eventEmitter.emit("vrchat_ready");
  });
}

// Wait until both Spotify and VRC are ready
async function waitForBothReady() {
  await new Promise(resolve => eventEmitter.once('spotify_ready', resolve));
  console.log("Spotify is ready");
  await new Promise(resolve => eventEmitter.once('vrchat_ready', resolve));
  console.log("VRC is ready");
  eventEmitter.emit('ready');
}
waitForBothReady();

// Start the webapp server for Spotify tokens
app.listen(8888, () => {
  require('child_process').exec('start http://localhost:8888/login'); // sorry
});

// Wait until Spotify is ready first, then start login process for VRC
setTimeout(VRCLoginFlow, 2e3);

eventEmitter.once("ready", () => {
  console.log("Everything is ready!");
  updateSpotPlayingStatus();
  setInterval(updateSpotPlayingStatus, 10e3);
})
