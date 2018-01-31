'use strict';

var express = require('express');
var passport = require('passport');
var util = require('util');
var session = require('express-session');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var GitHubStrategy = require('passport-github2').Strategy;
var partials = require('express-partials');
var https = require('https');
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');
var adapter = new FileSync('db.json');
var db = low(adapter);
var uuidv4 = require('uuid/v4');
var messages = require('./messages');

// Set some defaults
db.defaults({ users: [] }).write()


var GITHUB_CLIENT_ID = "G_C_I";
var GITHUB_CLIENT_SECRET = "G_C_S";
var GITHUB_API_HOST = 'api.github.com';
var USER_REPOS_PATH = '/user/repos';

//facebook
var PAGE_TOKEN = "P_T";
var VERIFY_TOKEN = "V_T";


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});



// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: "C_B_U"
},
  function (accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    let authorization_code = uuidv4();
    // console.log(accessToken);
    // console.log(JSON.stringify(profile));
    db.get('users').push({ id: authorization_code, accessToken: accessToken, gitUserId: profile.username }).write();
    return done(null, profile);
  }
));


var app = express();

// configure Express
app.use(partials());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(session({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());


app.get('/fb/webhook', function (req, res) {
  console.log(req.query);
  if (req.query && req.query['hub.verify_token']) {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      res.send(req.query['hub.challenge']);
    }
    else {
      res.send('invalid token');
    }
  }
});

app.post('/fb/webhook', function (req, res) {
  console.log(JSON.stringify(req.body));
  var data = req.body;
  res.send('ok');

  if (data && data.entry && data.entry[0] && data.entry[0].messaging) {
    var repo_id = data.entry[0].time;
    var messagingEvents = data.entry[0].messaging
    console.log(messagingEvents);


    for (var i = 0; i < messagingEvents.length; i++) {
      var messagingEvent = messagingEvents[i];

      var sender = messagingEvent.sender.id;

      let user = db.get('users').find({ fbUserId: sender }).value();

      let accessToken = '';
      if (user && user.accessToken) {
        console.log("User logged into GitHub" + user.fbUserId);
        accessToken = user.accessToken;
      }

      if (messagingEvent.message && messagingEvent.message.text) {
        if (messagingEvent.message.nlp && accessToken.trim().length > 1) {
          let nlpObj = messagingEvent.message.nlp;
          console.log(JSON.stringify(nlpObj));
          if (nlpObj.entities.name[0].value) {
            sendConfirmationToCreateRepo(sender, nlpObj.entities.name[0].value);
          }
        } else {
          var text = messagingEvent.message.text;
          console.log("Received a message: " + text);
          sendTextMessage(sender, "GHBot Says " + text);
        }

      } else if (messagingEvent.postback && messagingEvent.postback.payload) {

        console.log("Received a postback: " + messagingEvent.postback.payload);
        if (accessToken.trim().length <= 0) {
          sendAccountLinkMessage(sender);
        }
        else if (messagingEvent.postback.payload === 'NEW_USER_WELCOME') {
            sendTextMessage(sender, "Your are already linked you account with GitHub!!!");
            sendGihubAccountLinkMessageOptions(sender);
        }
       else if (messagingEvent.postback.payload === 'LIST_REPOS') {
        console.log('Calling getListOfRepos with access_token = ' + accessToken);
        getListOfRepos(sender, accessToken);
      }
      else if (messagingEvent.postback.payload === 'CREATE_REPO') {
        console.log('Calling createRepo with access_token = ' + accessToken);
        createRepo(sender, accessToken, repo_id);
      }
      else if (messagingEvent.postback.payload.includes('reponame')) {
        console.log('Calling createRepo with access_token = ' + accessToken);
        createRepo(sender, accessToken, messagingEvent.postback.payload.substr(9));
      }
    } else if (messagingEvent.account_linking && messagingEvent.account_linking.status) {
      console.log("Received a account_linking: " + messagingEvent.account_linking.status);
      if (messagingEvent.account_linking.status === 'linked') {
        let authorization_code_fb = messagingEvent.account_linking.authorization_code;
        db.get('users').find({ id: authorization_code_fb }).assign({ fbUserId: sender }).write();
        sendGihubAccountLinkMessageOptions(sender);
      }
    }
  }
}
});

app.get('/fb/authorize', getFbRedirect, passport.authenticate('github', { scope: ['repo'] }), function (req, res) {
});

app.get('/github/authcallback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function (req, res) {
    let gitHubUserId = req.user.username;
    let authorization_code = db.get('users').find({ gitUserId: gitHubUserId }).value().id;
    console.log('redirecting to FB using authorization_code=' + authorization_code);
    res.redirect(FB_MESSENGER_CALL_BACK_URL + '&authorization_code=' + authorization_code);
  });

app.listen(3000);


function sendConfirmationToCreateRepo(sender, value) {
  let repo_payload = 'reponame=' + value;

  let confirmGitRepoCreationMessageOptions = messages.fbMessages.confirmGitRepoCreationMessageOptions;

  confirmGitRepoCreationMessageOptions.attachment.payload.text = 'Create repo with name ' + value + ' ?';
  confirmGitRepoCreationMessageOptions.attachment.payload.buttons[0].payload = repo_payload;

  var json = {
    recipient: { id: sender },
    message: confirmGitRepoCreationMessageOptions,
  };
  // console.log(JSON.stringify(json));
  sendFbMsg(json);
}

function createRepo(sender, accessToken, repo_id) {
  let createRepoRequest = {
    name: "NEW_REPO_" + repo_id
  }
  console.log('Calling github to create repo with name=' + createRepoRequest.name);
  var options = {
    host: GITHUB_API_HOST,
    path: USER_REPOS_PATH,
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'User-Agent': 'GHApp'
    }
  };
  var callback = function (response) {
    var body = ''
    response.on('data', function (chunk) {
      body += chunk;
    });
    response.on('end', function () {
      // console.log(body);
      body = JSON.parse(body);
      var repos = [];
      let title = {
        title: body.name + " CREATED!!!"
      };
      repos.push(title);
      sendGitHubRepos(sender, repos);
    });
  }

  var req = https.request(options, callback);
  req.on('error', function (e) {
    console.log('problem with request: ' + e);
  });
  req.write(JSON.stringify(createRepoRequest));
  req.end();
}

function getListOfRepos(sender, accessToken) {
  console.log('Calling github to get repo list');
  var options = {
    host: GITHUB_API_HOST,
    path: USER_REPOS_PATH,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'User-Agent': 'GHApp'
    }
  };
  var callback = function (response) {
    var body = ''
    response.on('data', function (chunk) {
      body += chunk;
    });
    response.on('end', function () {
      // console.log(body);
      body = JSON.parse(body);
      var repos = [];
      body.forEach((repo) => {

        let title = {
          title: repo.name
        };
        repos.push(title);
      });
      sendGitHubRepos(sender, repos);
    });
  }

  var req = https.request(options, callback);
  req.on('error', function (e) {
    console.log('problem with request: ' + e);
  });

  req.end();
}

function sendGitHubRepos(sender, repos) {

  let text = '';
  repos.forEach((repo) => {
    text += repo.title + "\n"
  });

  let githubLinkedAccountMessageOptions = messages.fbMessages.githubLinkedAccountMessageOptions;
  githubLinkedAccountMessageOptions.attachment.payload.text = text;

  var json = {
    recipient: { id: sender },
    message: githubLinkedAccountMessageOptions,
  };
  // console.log(JSON.stringify(json));
  sendFbMsg(json);
}


function sendGihubAccountLinkMessageOptions(senderFbId) {
  var json = {
    recipient: { id: senderFbId },
    message: messages.fbMessages.githubLinkedAccountMessageOptions,
  };
  // console.log(JSON.stringify(json));
  sendFbMsg(json);
}


function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

var FB_MESSENGER_CALL_BACK_URL = '';

function getFbRedirect(req, res, next) {
  console.log(req.query);
  FB_MESSENGER_CALL_BACK_URL = req.query.redirect_uri;
  return next();
}

function sendAccountLinkMessage(senderFbId) {
  var json = {
    recipient: { id: senderFbId },
    message: messages.fbMessages.createAccountMessage,
  };
  // console.log(JSON.stringify(json));
  sendFbMsg(json);

}

function sendTextMessage(senderFbId, text) {

  var json = {
    recipient: { id: senderFbId },
    message: { text: text },
  };
  sendFbMsg(json);

}

function sendFbMsg(jsonParameter) {
  var json;
  if (Array.isArray(jsonParameter)) {
    json = jsonParameter[0];
  }
  else {
    json = jsonParameter;
  }

  var body = JSON.stringify(json);
  var path = '/v2.6/me/messages?access_token=' + PAGE_TOKEN;
  var options = {
    host: "graph.facebook.com",
    path: path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };
  var callback = function (response) {
    var str = ''
    response.on('data', function (chunk) {
      str += chunk;
    });
    response.on('end', function () {
      if (Array.isArray(jsonParameter)) {
        if (jsonParameter.length > 1) {
          jsonParameter.shift();
          sendAll(jsonParameter);
        }
      }
    });
  }

  var req = https.request(options, callback);
  req.on('error', function (e) {
    console.log('problem with request: ' + e);
  });

  req.write(body);
  req.end();
}
