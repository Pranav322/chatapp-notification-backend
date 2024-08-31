
const http = require('http'); // Native Node.js HTTP module
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();
console.log("Environment variables loaded.");

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      "type": "service_account",
      "project_id": process.env.FIREBASE_PROJECT_ID,
      "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
      "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      "client_email": process.env.FIREBASE_CLIENT_EMAIL,
      "client_id": process.env.FIREBASE_CLIENT_ID,
      "auth_uri": process.env.FIREBASE_AUTH_URI,
      "token_uri": process.env.FIREBASE_TOKEN_URI,
      "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log("Firebase Admin initialized.");
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
  process.exit(1);
}

const db = admin.firestore();
const serverStartTime = Date.now(); // Track when the server started

// Path to the specific subcollection
const specificMessagesRef = db.collection('messages')
  .doc('NnDlHK8QVQaBcTkXPNXIHtFFoiW2-Au1Lb3viduUE2KmfI4xXDgsVYAO2')
  .collection('NnDlHK8QVQaBcTkXPNXIHtFFoiW2-Au1Lb3viduUE2KmfI4xXDgsVYAO2');

// Function to handle snapshot changes
async function snapshotHandler(snapshot) {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === 'added') {
      const message = change.doc.data();
      const { idFrom, idTo, content, timestamp } = message;

      let messageTimeMillis = null;

      // Log the type and value of the timestamp field for debugging
      console.log("Received timestamp:", timestamp, "Type:", typeof timestamp);

      // Handle string timestamps by converting them to numbers
      if (typeof timestamp === 'string') {
        messageTimeMillis = parseInt(timestamp, 10); // Convert string to integer
      } else if (typeof timestamp === 'number') {
        messageTimeMillis = timestamp; // Numeric milliseconds
      } else if (timestamp instanceof admin.firestore.Timestamp) {
        messageTimeMillis = timestamp.toMillis(); // Firestore Timestamp
      } else {
        console.error("Unsupported timestamp format:", timestamp);
        return;
      }

      console.log("Processed timestamp (milliseconds):", messageTimeMillis);

      if (messageTimeMillis > serverStartTime) { // Ensure message is new
        console.log(`Processing new message: idFrom = ${idFrom}, idTo = ${idTo}, content = "${content}", timestamp = ${messageTimeMillis}`);

        try {
          // Fetch sender's nickname
          const senderDoc = await db.collection('users').doc(idFrom).get();
          let senderNickname = 'Unknown';

          if (senderDoc.exists) {
            const senderData = senderDoc.data();
            senderNickname = senderData.nickname || 'Unknown';
            console.log(`Sender nickname fetched: ${senderNickname}`);
          } else {
            console.warn(`Sender document not found for idFrom: ${idFrom}`);
          }

          // Fetch recipient's push token
          const userDoc = await db.collection('users').doc(idTo).get();
          if (userDoc.exists) {
            const user = userDoc.data();
            if (user.pushToken) {
              console.log("Sending notification to token:", user.pushToken);
              sendNotification(user.pushToken, senderNickname, content);
            } else {
              console.log("No push token found for user:", idTo);
            }
          } else {
            console.log("User document not found for:", idTo);
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      } else {
        console.log("Ignoring old message.");
      }
    }
  });
}

// Function to send notifications using FCM Admin SDK v2
function sendNotification(token, senderNickname, message) {
  const messagePayload = {
    token: token,
    notification: {
      title: senderNickname,
      body: message,
    },
    android: {
      notification: {
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };

  admin.messaging().send(messagePayload)
    .then(response => {
      console.log('Successfully sent message:', response);
    })
    .catch(error => {
      console.error('Error sending message:', error);
    });
}

// Listen to changes in the specific subcollection
specificMessagesRef.onSnapshot(snapshotHandler, error => {
  console.error("Error listening to Firestore changes:", error);
});

// Set up a simple HTTP server using Node's built-in http module
const port = process.env.PORT || 3000; // Use the port from the environment variable or default to 3000
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('This server is running and listening to Firestore changes.\n');
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

console.log("Firestore listener set up. Waiting for changes...");
