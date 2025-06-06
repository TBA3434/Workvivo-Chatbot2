/////////////////////////////////////////////////////////////////////////////////////////////////
//
// Feb 12, 2025
// yosuke.sawamura@zoom.us
// Workvivo Chatbot sample demo 
//
// node v20.17.0
// npm 11.0.0
//
// Note)
// 1. Make sure app.js (this) and package.json is present in the same directory.
//  $ npm install
// 2. Run the script
//  $ node app.js
//    or
//  $ pm2 start app.js --name "Workvivo-Chatbot"
//
/////////////////////////////////////////////////////////////////////////////////////////////////

// define node modules
const fs = require('fs')
const fsPromises = require('fs/promises')
const express = require('express')
const app = express()
const { execSync } = require("child_process")
const path = require('path');
const { runInNewContext } = require('vm')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const axios = require('axios');

// vars
const port = process.env.PORT
const other = `${__dirname}/log/other_data.log`

// middleware to parse JSON request bodies
app.use(express.json());

// middleware to parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// add this line after the express middleware setup
app.use(express.static('public'));

// add this function before the app.post('/webhook') route
// verify x-workvivo-jwt header for verifying the request’s authenticity. 
async function verifyWorkvivoRequest(token) {
  const decodedToken = jwt.decode(token, { complete: true });
  const { kid } = decodedToken.header;
  const { publicKeyUrl } = decodedToken.payload;
  // fetch the JWK
  const client = jwksClient({ jwksUri: publicKeyUrl });
  const key = await client.getSigningKey(kid);
  const signingKey = key.getPublicKey();
  // verify the token
  return jwt.verify(token, signingKey);
}

// handling webhook post events
async function handleWebhook(req, res) {
  // log req datas
  console.log("request headers", req.headers);
  const bodyString = JSON.stringify(req.body); // convert JSON to String
  writedata(other, bodyString);

  try {
    const webhook = req.body;

    if (webhook.action === 'chat_bot_message_sent') {

      // token verification
      try {
        const token = req.headers['x-workvivo-jwt'];
        //console.log("token:", token);
        if (!token) {
          console.log("token error:", "Missing Workvivo jwt");
          return res.status(401).json({ error: 'Missing Workvivo jwt' });
        }
        const verificationResult = await verifyWorkvivoRequest(token);
        console.log("Token verification result:", JSON.stringify(verificationResult, null, 2));
      } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(401).json({ error: 'Invalid signature' });
      }

      return res.status(200).json({ success: true });

    } else if (webhook.category === 'bot_message_notification') {
      // define headers
      const baseRequestConfig = {
        method: 'post',
        url: process.env.WORKVIVOAPIURL,
        headers: {
          'Workvivo-Id': `${process.env.WORKVIVOID}`,
          'Authorization': `Bearer ${process.env.WORKVIVOTOKEN}`,
          'Content-Type': 'application/json'
        }
      };
      // define data/payloads
      let requestPayload;

      switch (webhook.message?.text?.toLowerCase()) {
        case 'card':
          requestPayload = {
            bot_userid: webhook.bot.bot_userid,
            channel_url: webhook.channel.channel_url,
            type: 'card',
            cards: [{
              cardTitle: "Welcome to Chat Demo",
              cardDescription: "demonstrating basics",
              cardImage: `${process.env.IMAGEURL}chatbot.png`,
              buttons: [
                { label: "IT Help", message: "IT Help" },
                { label: "HR Help", message: "HR Help" },
                { label: "Other", message: "Other" },
                { label: "Yahoo", link: "https://www.yahoo.co.jp/" },
              ]
            }]
          };
          break;
        case 'card2':
          requestPayload = {
              bot_userid: webhook.bot.bot_userid,
              channel_url: webhook.channel.channel_url,
              type: 'card',
              cards: [
              {
                cardTitle: "Welcome to Chat Demo 1",
                cardDescription: "demonstrating basics 1",
                cardImage: `${process.env.IMAGEURL}1.png`,
                buttons: []
              },
              {
                cardTitle: "Welcome to Chat Demo 2",
                cardDescription: "demonstrating basics 2",
                cardImage: `${process.env.IMAGEURL}2.png`,
                buttons: [{ label: "IT Help 2", message: "IT Help 2" }]
              },
              {
                cardTitle: "Welcome to Chat Demo 3",
                cardDescription: "demonstrating basics 3",
                cardImage: `${process.env.IMAGEURL}3.png`,
                buttons: [
                  { label: "IT Help Button 3-1", message: "IT Help 3-1" },
                  { label: "IT Help Button 3-2", message: "IT Help 3-2" },
                  { label: "IT Help Button 3-3", message: "IT Help 3-3" },
                ]
              }
            ]
          };
          break;
        case 'quick':
          requestPayload = {
            bot_userid: webhook.bot.bot_userid,
            channel_url: webhook.channel.channel_url,
            type: 'quick_reply',
            "replies": [
              {
                "label": "Unable to connect to this network",
                "message": "Unable to connect to this network"
              },
              {
                "label": "Incorrect Password",
                "message": "Incorrect Password"
              },
              {
                "label": "No error message, just won’t connect",
                "message": "No error message, just won’t connect"
              },
              {
                "label": "Other",
                "message": "Other"
              }
            ]
          };
          break;
        default:
          requestPayload = {
            bot_userid: webhook.bot.bot_userid,
            channel_url: webhook.channel.channel_url,
            type: 'message',
            message: webhook.message.text
          };
          break;
      }

      const response = await axios({
        ...baseRequestConfig,
        data: requestPayload
      });

      console.log('API Response:', JSON.stringify(response.data, null, 2));
      return res.status(200).json({ success: true });
    }

    console.log("No action defined from webhook");
    return res.status(200).json({ error: 'No action defined from webhook' });


  } catch (error) {
    console.error('Webhook handler error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data ? JSON.stringify(error.response.data, null, 2) : null,
      requestPayload: error.config?.data ? JSON.stringify(JSON.parse(error.config.data), null, 2) : null,
      url: error.config?.url
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// post request, route all post request
app.post('/webhook', handleWebhook);

// get request
app.get('/', (req, res) => {
  console.log(logCurrentDateTime(), "GET");
  console.log(logCurrentDateTime(), req.body);
  res.status(200);
  res.send(`Workvivo Chatbot Webhook server successfully running.`);
});

app.listen(port, () => console.log(logCurrentDateTime(), `Zoom Workvivo Webhook. runnning on port: ${port}`));

// write log
async function writedata(datadir, newdata) {
  try {
    //await fsPromises.writeFile(datafile, newdata)
    await fsPromises.appendFile(datadir, newdata + '\n');
    console.log(logCurrentDateTime(), 'log saved successfully.');
  } catch (err) {
    console.error(err)
  }
};

// get date and time
function logCurrentDateTime() {
  const currentDate = new Date();
  let d = currentDate.toDateString() + " " + currentDate.toTimeString().split(' ')[0];
  return d;
}
