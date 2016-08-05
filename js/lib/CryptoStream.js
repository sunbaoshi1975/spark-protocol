/*
*   Copyright (c) 2015 Particle Industries, Inc.  All rights reserved.
*
*   This program is free software; you can redistribute it and/or
*   modify it under the terms of the GNU Lesser General Public
*   License as published by the Free Software Foundation, either
*   version 3 of the License, or (at your option) any later version.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
*   Lesser General Public License for more details.
*
*   You should have received a copy of the GNU Lesser General Public
*   License along with this program; if not, see <http://www.gnu.org/licenses/>.
*/


var Transform = require('stream').Transform;
var CryptoLib = require("./ICrypto");
var crypto = require('crypto');
var logger = require('../lib/logger.js');

var CryptoStream = function (options) {
    Transform.call(this, options);
    this.key = options.key;
    this.iv = options.iv;
    this.encrypt = !!options.encrypt;
};
CryptoStream.prototype = Object.create(Transform.prototype, { constructor: { value: CryptoStream }});
CryptoStream.prototype._transform = function (chunk, encoding, callback) {
    try {

        //assuming it comes in full size pieces
        var cipher = this.getCipher(callback);
        cipher.write(chunk);
        cipher.end();
        cipher = null;

        if (!this.encrypt) {
            //ASSERT: we just DECRYPTED an incoming message
            //THEN:
            //  update the initialization vector to the first 16 bytes of the encrypted message we just got
            this.iv = new Buffer(16);
            chunk.copy(this.iv, 0, 0, 16);

            //logger.log('server: GOT ENCRYPTED CHUNK', chunk.toString('hex'));
        }
//        else {
//            console.log('pre-encrypt sending: ' + chunk.toString('hex'));
//        }
    }
    catch (ex) {
        logger.error("CryptoStream transform error " + ex);
    }
};
CryptoStream.prototype.getCipher = function (callback) {
    var cipher = null;
    if (this.encrypt) {
        cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
    }
    else {
        cipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
    }

    var ciphertext = null,
        that = this;

    cipher.on('readable', function () {
        var chunk = cipher.read();

        //if (!ciphertext) {
        //    ciphertext = chunk;
        //}
        //else {
        //    ciphertext = Buffer.concat([ciphertext, chunk], ciphertext.length + chunk.length);
        //}
        /*
         The crypto stream error was coming from the additional null packet before the end of the stream

         IE
         <Buffer a0 4a 2e 8e 2d ce de 12 15 03 7a 42 44 ca 84 88 72 64 77 61 72 65 2f 6f 74 61 5f 63 68 75 6e 6b>
         <Buffer 5f 73 69 7a 65 ff 35 31 32>
         null
         CryptoStream transform error TypeError: Cannot read property 'length' of null
         Coap Error: Error: Invalid CoAP version. Expected 1, got: 3

         The if statement solves (I believe) all of the node version dependency ussues

         ( Previously required node 10.X, with this tested and working on node 12.5 )

         */
        if(chunk) {
            if ( !ciphertext ) {
                ciphertext = chunk;
            }
            else {
                ciphertext = Buffer.concat( [ciphertext, chunk], ciphertext.length + chunk.length );
            }
        }
    });
    cipher.on('end', function () {
        //var action = (that.encrypt) ? "encrypting" : "decrypting";
        //logger.log(action + ' chunk to ', ciphertext.toString('hex'));

        that.push(ciphertext);

        if (that.encrypt) {
            //logger.log("ENCRYPTING WITH ", that.iv.toString('hex'));
            //get new iv for next time.
            that.iv = new Buffer(16);
            ciphertext.copy(that.iv, 0, 0, 16);

            //logger.log("ENCRYPTING WITH ", that.iv.toString('hex'));
        }
        ciphertext = null;

        callback();
    });

    return cipher;
};
module.exports = CryptoStream;

