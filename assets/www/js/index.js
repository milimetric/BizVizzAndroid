/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// IMPORTANT: for this file to work, you must define iqeKey, iqeSecret, and bizVizzKey
var deviceId = '';
var iqeQueries = {};

var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    onDeviceReady: function() {
        app.receivedEvent('deviceready');
        deviceId = device.uuid;
        app.start();
    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    },
    start: function(){
        
        $('a.picture').on('click', function(){
            console.log('getting picture');
            navigator.camera.getPicture(cameraSuccess, fail, {
                quality: 80,
                destinationType: navigator.camera.DestinationType.FILE_URI
            });
        });
        
        
        function cameraSuccess(imageUri){
            imagePath = imageUri.replace('file://', '');
            // TODO: show a thumbnail of the image and a spinner showing that it's waiting for results
            console.log('snapped an image: ' + imagePath);
            
            var options = new FileUploadOptions();
            options.fileName = imagePath.substr(imagePath.lastIndexOf('/')+1);
            options.fileKey = 'img';
            //options.mimeType = "image/jpeg";

            var data = {
                api_key: iqeKey,
                img: options.fileName,
                time_stamp: moment().format('YYYYMMDDHHmmSS'),
                device_id: deviceId,
                json: true
            };
            data.api_sig = getIQESignature(data);
            options.params = data;
            
            console.log('calling query: ' + data.api_sig);

            var fileTransfer = new FileTransfer();
            fileTransfer.upload(imagePath, 'http://api.iqengines.com/v1.2/query/', function(){
                console.log('query call completed for: ' + data.api_sig);
                iqeQueries[data.api_sig] = data;
                
            }, fail, options);
            
        };
        
        
        function checkForUpdates(){
            var data = {
                api_key: iqeKey,
                time_stamp: moment().format('YYYYMMDDHHmmSS'),
                device_id: deviceId,
                json: true
            };
            
            data.api_sig = getIQESignature(data);
            console.log('checking for updates: ' + data.api_sig);
            
            $.post('http://api.iqengines.com/v1.2/update/', data)
                .done(function(response){
                    console.log('got updates back: ' + JSON.stringify(response));
                    if (response.data && response.data.results){
                        var queryResults = response.data.results;
                        for (r in queryResults){
                            var q = queryResults[r];
                            iqeQueries[q.qid].labels = q.qid_data.labels;
                            
                            // call BizVizz service now
                            $.post('bizvizz', getBizVizzSearch(q.qid_data.labels), function(bizVizzResponse){
                                // console.log('got companies for ' + q.qid + ': ' + bizVizzResponse.data.companies);
                                iqeQueries[q.qid].companies = bizVizzResponse.data.companies;
                                
                                // and finally show the result
                                // TODO: show result
                            });
                        }
                    }
                })
                .fail(fail)
                .complete(function(){
                    console.log('completed update call ' + data.api_sig + ', going again');
                    // keep polling
                    checkForUpdates();
                });
        }
        // always be polling for updates
        checkForUpdates();
        
        
        // getIQESignature test:
        // getIQESignature({
        //  api_key: 'testing',
        //  time_stamp: 'test',
        //  img: 'test.png'
        // }) === '895267803b47e8f3d228e61cabf630bbe45fecd8';
        function getIQESignature(parameters){
            var fields = [];
            var rawString = '';
            for (p in parameters){
                fields.push('' + p + parameters[p]);
            }
            fields = fields.sort();
            rawString = fields.join('');
            
            var hmacObj = new jsSHA(rawString, "ASCII");
            var hmac = hmacObj.getHMAC(iqeSecret, "ASCII", "SHA-1", "HEX");
            return hmac;
        };
        
        
        function getBizVizzSearch(term){
            return {
                api_key: bizVizzKey,
                search_term: term
            }
        };
        
        
        function fail(err){
            // TODO: exception handling
            console.error('failed: ' + JSON.stringify(err));
        };
    }
};
