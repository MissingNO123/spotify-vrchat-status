# Spotify Now Playing Status for VRChat

Sets your status on VRChat to the name and artist of the currently playing song on Spotify.
Uses [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node) and [vrchatapi-javascript](https://github.com/vrchatapi/vrchatapi-javascript).

## Prerequesites
- Install [Node.js](https://nodejs.org)
- Create an application on [Spotify's Developer Page](https://developer.spotify.com/dashboard/applications)
- Add `http://localhost:8888/callback` to the callback URL whitelist
- Take note of the Client ID and Secret for your application

## Installation
- Clone the repository with `git clone https://github.com/MissingNO123/spotify-vrchat-status.git`
- cd into the project folder
- copy or rename `config.example.json` to `config.json`
- add your Client ID and Secret from Spotify to `config.json`
- Run `npm install`

## Usage
```bash
npm start
```
- It will open a browser window to generate the auth tokens for Spotify
  - If it fails, open http://localhost:8888/login manually
- Log in with your VRChat username and password (and 2FA, if necessary)
- Play something on Spotify

## Disclaimer

VRChat does not officially support use of their API outside of the VRChat client, 
so using this tool could get your account suspended without warning at any time. 
While the program tries not to access either API excessively, 
there's no guarantee that this won't be deemed excessive by VRChat's moderators in the future.
Use at your own risk.

This is the official statement from Tupper:

> Use of the API using applications other than the approved methods (website, VRChat application) are not officially supported. You may use the API for your own application, but keep these guidelines in mind:
> * We do not provide documentation or support for the API.
> * Do not make queries to the API more than once per 60 seconds.
> * Abuse of the API may result in account termination.
> * Access to API endpoints may break at any given time, with no warning.