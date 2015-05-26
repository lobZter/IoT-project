// import required libraries
var express = require('express')
  , colors = require('colors')
  , TimerJob = require('timer-jobs')
  , net = require('net')
  , http = require('http')
  , openmtc = require('openmtc')
  , XIA = openmtc.interfaces.xIa
  , HttpAdapter = openmtc.transport.http.client
  , gscl = openmtc.config_gscl.scl
  , nscl = openmtc.config_nscl.scl;

// configuration of our application
var config = {
    host:'140.113.65.29',
    port:'55556',
    appId:'Dorm7_110_DA',       // appID for this application
    containerID:'current',      // the name of our application's data container
    maxNrOfInstances: '10',       // max number of contentInstances in our container
    deviceIP: '140.113.65.28',  // arduino IP
    devicePort: '55558'         // arduino port
};  

// Create an HTTP client for dIa interface
var httpHandler = new HttpAdapter();
// create a dIa interface object
var dIaClient = new XIA(gscl.dia.uri, httpHandler);
// create socket
var client = new net.Socket();
// set timer jobs
var timerGetData = new TimerJob({interval: 5000}, function(done) {
    client.write('req4data');
    done();
});
var app = express();
app.use(express.logger('dev')); // setup logging
app.use(express.bodyParser());  //automatically parse incoming data as JSON
var dIaServer = http.createServer(app);
dIaServer.listen(config.port);  


//some helper methods to decode contentInstance data
function parseB64Json(s) {
  return JSON.parse(new Buffer(s, 'base64').toString('utf8'));
}
function getRepresentation(o) {
  if (o.representation.contentType !== 'application/json') {
    throw new Error("Unknown content type");
  }
  return JSON.parse(new Buffer(o.representation.$t, 'base64').toString('utf8'));
}
function getNotificationData(req) {
	return getRepresentation(req.body.notify);
}

function pushData(data) {
        
    console.log("Pushing data: ".bgBlue, data);

    var contentInstance = {
        contentInstance: {
            content: {
                $t: new Buffer(JSON.stringify(data)).toString('base64'),  //Base64 representation of our data
                contentType: 'application/json'
            }
        }
    };

    dIaClient.requestIndication(
        'CREATE', null,
        gscl.dia.uri + '/applications/' + config.appId +
        '/containers/' + config.containerID + '/contentInstances',
        contentInstance
    ).on('STATUS_CREATED', function (data) {
        console.log('Data pushed'.bgBlue);
    }).on('ERROR', function(error) {
        console.log("Failed to push data".bgBlue);
    });
}

function handleIncomingData(data) {
    
    console.log("Received data: ".bgBlue + data);
    
    var pos = data.indexOf(",");
    
    var dataToPush = {
        value: data.substring(0 ,pos-1),
        timestamp: data.substr(pos+1, 10)
    }

    pushData(dataToPush);
}

function handleContentInstances(contentInstances) {
	
    console.log("Handling ContentInstances".bgBlue);
	
    var contentInstanceCollection = contentInstances.contentInstanceCollection.contentInstance;
    console.log("Number of Instances: " + contentInstanceCollection.length);
    var trigger = parseB64Json(contentInstanceCollection[0].content.$t).value;
    
    if(trigger == "1") {
        console.log("ON".bgBlue);
        client.write("ON");
    }
    else if(trigger == "0"){
        console.log("OFF".bgBlue);
        client.write("OFF");
    }
}

function subscrideToContainer() {

	console.log("Subscribing to containers".bgBlue);
	
	var notifyPath = '/trigger';
	var notifyUri = 'http://' + config.host + ':' + config.port + notifyPath;

	app.post(notifyPath, function(req, res) {
		console.log("Got contentInstances notification".bgBlue);
		
		var notificationData = getNotificationData(req);
		//console.log(notificationData);
		handleContentInstances(notificationData.contentInstances);
		
		res.send(200);
	});
    
	dIaClient.requestIndication('CREATE', null, 
		nscl.dia.uri + '/applications/Dorm7_110_NA/containers/trigger/contentInstances/subscriptions',
		{ subscription: { contact: notifyUri } }
	).on('STATUS_CREATED', function (data) {
		console.log('Subscribed to contentInstances of '.bgBlue + containerId.bgBlue);
	}).on("ERROR", function(err){
		console.log("Error creating subscription for contentInstances: ".bgBlue + err.bgBlue);
	});
	
}

function createContainer() {

    console.log("Creating Container".bgBlue);
    
    var containerData = {
        container:
        {
            id: config.containerID
        }
    };

    dIaClient.requestIndication(
        'CREATE', null,
        gscl.dia.uri + '/applications/' + config.appId + '/containers',
        containerData
    ).on('STATUS_CREATED', function (data) {
        console.log("Container Created".bgBlue);
        
        // socket connect to arduino
        client.connect(config.devicePort, config.deviceIP, function() {
            console.log("Socket connected".bgBlue);
        });
        client.on('data', function(data) {
            var str = data.toString();
            handleIncomingData(str);
        });
        
        // request for current data every 1 second
        timerGetData.start();

    }).on('ERROR', function(error) {
        console.log("Failed to create container".bgBlue);
    });
}

function main() {

    console.log("Registering Application".bgBlue);

    var appData = {
        application: { appId: config.appId }
    };

    dIaClient.requestIndication(
        'CREATE', null,
        gscl.dia.uri + '/applications',
        appData
    ).on('STATUS_CREATED', function (data) {
        console.log("Application registered".bgBlue);
        
        createContainer(); 
        subscrideToContainer(); // subscribe to NA container(on/off trigger)
        
    }).on('ERROR', function(error) {
        //409 is the HTTP error code for "conflict". This error occurs when an application
        //with the same ID as ours is already registered. 
        //For our training scenario, we'll just assume that we are already registered. 
        //In 'reality' we would of course have to handle this more sophisticated.
        if (error == 409) {
            console.log("Application already registered.".bgYellow);
            createContainer();
            subscrideToContainer();
        }
        else
            console.log("Failed to register app: ".bgBlue + error.bgBlue);
    });
}

main();






