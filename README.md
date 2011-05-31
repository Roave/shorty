Shorty - SMPP Client / Server
================================
Version 0.2.2 Created by Evan Coury and Ben Youngblood


Introduction
------------
Shorty is a lightweight, high performance SMPP client and server built on Node.js 
(tested on v0.2.8, v0.4.0, and v0.4.1). Shorty is sponsored and maintained by 
[SMS Cloud](http://www.smscloud.com/), a subsidiary of MediaTech Designs, LLC.

Usage
-----
Easy method: `npm install shorty`

To install the current dev release, just clone the repository, navigate to the source
folder and do `npm install .`. Keep in mind that releases that aren't tagged with a
version are typically unstable and should not be used in a production environment.

Once you have Shorty installed, all you have to do is `require('shorty')` to get
started. There is documentation below, but the best way to see how everything
works is to look at **`client-example.js`** and **`server-example.js`**.

### Client (ESME) ###
Client implementations are pretty straightforward. `shortyClient =
shorty.createClient('config.json')` will create a new client with the given
configuration file (see **`config.dist.json`** for an example).

From there, you can add callbacks with `shortyClient.on`, which accepts the
callback name and a callback function. Once you've added callbacks, call
`shortyClient.connect()` to connect to the SMSC and start an SMPP session.

Messages can be sent with `shortyClient.sendMessage(senderNumber,
recipientNumber, message)`. At this time, Shorty does not support messages
greater than 160 characters. The return value will be an ID assigned by
shorty, which will be unique for the SMPP session.

+ bindSuccess(): fired when the client is successfull bound to the SMSC. **No SMPP
  commands should be sent before this callback is fired.**
+ sendSuccess(id): fired when a message sent with sendMessage() is acknowledged
  with no errors by the SMSC.
+ sendFailure(id): fired when a message sent with sendMessage() is acknowledged
  by the SMSC, but has been refused for some reason
+ incomingMessage(senderNumber, recipientNumber, message): fired when an
  incoming (mobile-originated) message is received from the SMSC

License
-------
Shorty is released under the terms of the [GNU General Public License (GPL) Version 3](http://en.wikipedia.org/wiki/GNU_General_Public_License). See **`COPYING`** file for details.
