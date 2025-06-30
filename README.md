# Workvivo-Chatbot
<p>
  <b>Note:</b><br><br>
  This node.js server was tested on a secured web proxy environment.<br>
  Chatbot requires secured https communication.<br>
  Before running, either modify app.js to use ssl certificate or place it behind a https capable environment (e.g. https reverse proxy). 
</p>

<br>

<p>
<b>To Do:</b><br><br>
1. Configure your environment. (file: .env)<br>
....<br>
PORT= <i>YOUR WEB SERVER SERVICE PORT</i> <br>
IMAGEURL= <i>YOUR WEB SERVER PATH TO PUBLIC DIRECTORY</i> <br>
WORKVIVOID= <i>YOUR ORGANIZATION WROKVIVO ID</i> <br>
WORKVIVOTOKEN= <i>YOUR WORKVIVO API BEARER TOKEN</i> <br>
....<br><br>
2. Make sure app.js and package.json are in the same directory.<br><br>
 $ npm install<br>
  <br>
3. Run the script<br>
  <br>
 $ node app.js<br>
</p>

<br>

<p>
  <b>Other Tips:</b><br><br>
  Below includes an example to programmatically create chatbot thread and send text messages without user initial interaction.<br>
  <br>
  https://github.com/Yosuke-workvivo/Workvivo-Chatbot/tree/main/Sample<br>
  <br>
  <I>Note)</I><br>
   - <b>User ID</b> can be retrieved using "Users" API. (e.g. GET Get a single user by email | https://developer.workvivo.com/#affd94d1-49cb-4891-880c-72f822f9b3a5)<br>
   - <b>Bot User ID</b> can be retrieved using "Chat" API. (e.g. GET Get a collection of chat bots | https://developer.workvivo.com/#16946ff7-e4f2-4e95-969e-fbe30ef81791)<br>
</p>

<br>

<p>
<b>Workvivo Support Documents:</b><br><br>

Chat Bots (guide to configure your chatbot infrastructure)<br>
https://support.workvivo.com/hc/en-gb/articles/23790354570013-Chat-Bots-Alpha-Release

Bots (guide includes the API method)<br>
https://developer.workvivo.com/#6bde2e09-95dc-48ac-8686-b5c29dbe347c

API Authentication - Bearer Token (guide includes requirements to use API)<br>
https://support.workvivo.com/hc/en-gb/articles/24560593493661-API-Authentication-Bearer-Token
</p>
