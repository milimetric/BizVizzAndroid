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
var stateSaveKey = 'searches';

var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
    },
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        document.addEventListener('pause', this.pause, false);
        document.addEventListener('resume', this.resume, false);
    },
    onDeviceReady: function() {
        app.receivedEvent('deviceready');
        deviceId = device.uuid;
        app.start();
    },
    pause: function() {
        window.localStorage.setItem(stateSaveKey, JSON.stringify(iqeQueries));
    },
    resume: function() {
        lastState = window.localStorage.getItem(stateSaveKey);
        if (!lastState) { return; }
        try {
            iqeQueries = JSON.parse(lastState);
            app.refreshSearchList();
        } catch (e) {
            console.error('couldn\'t restore state: ' + e);
        }
    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    },
    refreshSearchList: function() {
        $('ul.searchList').empty();
        for (qid in iqeQueries){
            var data = iqeQueries[qid];
            app.addSearchListItem(data);
            app.addCompaniesToSearchListItem(qid, data.companies);
        }
    },
    addSearchListItem: function(data) {
        $.tmpl($('#template-search').html(), data).appendTo('ul.searchList')
        $('#'+data.api_sig+' span.label').text(data.labels);
    },
    addCompaniesToSearchListItem: function(qid, companies) {
        if (qid && companies && companies.length){
            $('#'+qid+' ul.companyList').html('').append(
                $.tmpl($('#template-company').html(), companies)
            );
        }
    },
    start: function(){
        // try resuming to bring back any state that might be saved
        app.resume();
        
        
        $('a.picture').on('click', function(event){
            event.preventDefault();
            console.log('getting picture, not over 600px');
            navigator.camera.getPicture(cameraSuccess, fail, {
                quality: 80,
                destinationType: navigator.camera.DestinationType.FILE_URI,
                targetWidth: 600,
                targetHeight: 600
            });
        });
        
        
        function cameraSuccess(imageUri){
            imagePath = imageUri.replace('file://', '');
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
                data.imageUri = imageUri;
                iqeQueries[data.api_sig] = data;
                
                app.addSearchListItem(data);
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
                            if (!q || !q.qid || !iqeQueries[q.qid]) { continue; }
                            
                            iqeQueries[q.qid].labels = q.qid_data.labels;
                            $('#'+q.qid+' span.label').text(q.qid_data.labels);
                            $('#'+q.qid+' ul.companyList').append('<li>Searching Manufacturers</li>');
                            
                            // call BizVizz service now
                            $.get('http://api.bizvizz.com/company/explore', getBizVizzSearch(q.qid_data.labels))
                                .done(function(bizVizzResponse){
                                    companies = bizVizzResponse.data.companies;
                                    iqeQueries[q.qid].companies = companies
                                    
                                    app.addCompaniesToSearchListItem(q.qid, companies);
                                })
                                .fail(fail);
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
            if (err.status == '0'){
                console.log('probably the update call timing out');
            } else {
                console.error('failed: ' + JSON.stringify(err));
            }
        };
    }
};


// set up company links to open up in web browser
function openInBrowser(href){
    // TODO: get links to open externally
    navigator.app.loadUrl(href, { openExternal:true });
};
