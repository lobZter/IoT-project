/**
 * NA for OpenMTC Training
 * Provides a web page which presents temperature data pushed by the 
 * corresponding DA and visualized using google charts. 
 * Provides re-targeting using <sclUri>.
 * @type {*}
 */

/* external modules */
// http API from nodejs
var http = require('http');
// express web framework
var express = require('express');

var colors = require('colors');

/* internal modules */
// provides dIa primitives
var openmtc = require('openmtc');

//mIa / dIa client
var XIA = openmtc.interfaces.xIa;
// maps primitives to http
var HttpClient = openmtc.transport.http.client;

//SCL settings
var gscl = openmtc.config_gscl.scl;
var nscl = openmtc.config_nscl.scl;

//our app's configuration
var config = {
  host: 'localhost',
  port: '55557',
  appId: 'Dorm7_110_NA',
  notificationResource: "/notify" 
};

/* we want to subscribe for data from container in application below */
var targetApplicationID = 'Dorm7_110_DA';

/* SCL that should be registered at NSCL and hosting the application */
var targetSclID = 'openmtc-gscl';

/* contactURI used in subscription */
var contactURI = 'http://' + config.host + ':' + config.port;
var notificationPath = '/notify';

/* express */
var app = express();

/* express configuration */
app.configure(function () {
  app.use(express.static(__dirname + '/public'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
});

/* web server (dIa) */
var dIaServer = http.createServer(app);

dIaServer.listen(config.port);

var currentData = [];
/* event channel */
/*var eventChannel = require('socket.io').listen(dIaServer);



eventChannel.sockets.on('connection', function (socket) {
  'use strict';
  console.log('socket browser connected');
  socket.on('echo', function (echo_data) {
    console.log('Echo data: ' + echo_data);
    eventChannel.sockets.emit('echo-back', 'this is from server-' + echo_data);
  });
});*/

app.get("/initial_data", function(req, res) {
	console.log("Got request for initial data.");
	res.send(currentData);
});

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

//create client for dIa interface
//generic communication module
//sclUri for re-targeting
//var httpClient = new HttpClient(config);
var httpClient = new HttpClient({ sclUri: nscl.dia.hostUri });

//dIa interface
var dIaClient = new XIA(nscl.uri, httpClient, 'dIa');

function handleContentInstances(contentInstances) {
  console.log("Handling ContentInstances.".bgYellow);
  console.log(contentInstances);
  var contentInstanceCollection = contentInstances.contentInstanceCollection.contentInstance;
  console.log("Number of Instances: ".bgYellow + contentInstanceCollection.length);

  var newData = [];

  //convert the raw data to the structure we require
  for (var i = 0; i < contentInstanceCollection.length; ++i) {

    //we now have the BASE64 representation of our data. We still need to decode it:
    var dataPoint = parseB64Json(contentInstanceCollection[i].content.$t);
    console.log(dataPoint);

    //dataPoint is an object. We want a tuple of ( timestamp, value )
    var timestamp = new Date(parseInt(dataPoint.timestamp));
    //var timestamp = parseInt(dataPoint.timestamp);

    console.log(dataPoint.timestamp, " -> ", timestamp);

    //newData.push( [ timestamp, parseFloat(dataPoint.value) ] );
    currentData.push( [ timestamp, parseFloat(dataPoint.value) ] );
  }

  //currentData = newData;
  //eventChannel.sockets.emit('data', currentData);
}

function subscrideToContainer(containerId) {
	console.log('Subscribing to containers...'.bgYellow);
  //we are not interested in the container itself, only in its contentInstances

  //The internal URI path we will receive notifications about new contentInstances on
	var notifyPath = config.notificationResource + "/contentInstances";

  //The full external URI, that we will communicate as contactURI to the SCL 
	var notifyUri = contactURI + notifyPath;

  //Tell express JS to accept requests for the defined notification path
	app.post(notifyPath, function(req, res) {
		console.log("Got contentInstances notification".bgYellow);
		console.log(req.body);
		var notificationData = getNotificationData(req);
		console.log(notificationData);
		handleContentInstances(notificationData.contentInstances);
		res.send(200);
	});

	dIaClient.requestIndication('CREATE', null, 
		gscl.dia.hostUri + containerId + '/contentInstances/subscriptions', 
		{ subscription: { contact: notifyUri } }
	).on('STATUS_CREATED', function (data) {
	      console.log('Subscribed to contentInstances of '.bgYellow + containerId.bgYellow);
	}).on("ERROR", function(err){
	      console.log("Error creating subscription for contentInstances: ".bgYellow + err.bgYellow);
  });
}

function handleContainersData(containers) {
  console.log("Handling containers data.".bgYellow);

  var containerReferences = containers.containerCollection.namedReference;

  //actually the DA should only have created a single container,
  //we anyway loop through the whole list, just to be safe
  for (var i = 0; i < containerReferences.length; ++i) {
    var containerReference = containerReferences[i];
    subscrideToContainer(containerReference.$t);
  }
}

function subscrideToDeviceApplication(deviceApplicationId) {
	console.log("Found my DA: ".bgYellow + deviceApplicationId.bgYellow);
  
  //We have idientified an application we are interested in.
  //Now we will retrieve information about all its containers
  //The internal URI path we will receive notifications about new containers on
	var notifyPath = config.notificationResource + "/containers";

  //The full external URI, that we will communicate as contactURI to the SCL 
	var notifyUri = contactURI + notifyPath;

  //Tell express JS to accept requests for the defined notification path
	app.post(notifyPath, function(req, res) {
		console.log("Got containers notification.".bgYellow);
		var notificationData = getNotificationData(req);
		console.log(notificationData);

		handleContainersData(notificationData.containers);

		res.send(200);
	});

	dIaClient.requestIndication('CREATE', null, 
		gscl.dia.hostUri + deviceApplicationId + '/containers/subscriptions', 
		{ subscription: { contact: notifyUri } }
	).on('STATUS_CREATED', function (data) {
        console.log('Subscribed to containers of '.bgYellow + deviceApplicationId.bgYellow);
	}).on("ERROR", function(err){
        console.log("Error creating subscription for containers: ".bgYellow + err.bgYellow);
  });
}

function handleApplicationsData(applications) {
  console.log("Handling applications data.".bgYellow);

  var applicationReferences = applications.applicationCollection.namedReference;

  //we get information about all registered apps. 
  //Here we look for the one we are actually interested in
  for (var i = 0; i < applicationReferences.length; ++i) {
    var applicationReference = applicationReferences[i];
    console.log("Found an application: ".bgYellow + applicationReference.bgYellow);
    if (applicationReference.id == targetApplicationID)
    // dirty hack because of dead locks with announcements and retargeting
      setTimeout(function () {
        subscrideToDeviceApplication(applicationReference.$t);
      }, 100);
  }
}

function subscrideToApplications() {
	console.log('Subscribing to applications...'.bgYellow);
  //first make sure that we are able to receive notifications
    
  //The internal URI path we will receive notifications about new applications on
	var notifyPath = config.notificationResource + "/";

  //The full external URI, that we will communicate as contactURI to the SCL 
	var notifyUri = contactURI + notifyPath;

  //Tell express JS to accept requests for the defined notification path
	app.post(notifyPath, function(req, res) {
		console.log("Got applications notification.".bgYellow);
		var notificationData = getNotificationData(req);
		console.log(notificationData);

		handleApplicationsData(notificationData.applications);

		res.send(200);
	});

	dIaClient.requestIndication('CREATE', null,
		gscl.dia.hostUri + '/m2m/applications/subscriptions',
		{ subscription: { contact: notifyUri } }
	).on('STATUS_CREATED', function (data) {
        console.log('Subscribed to applications.'.bgYellow);
	}).on("ERROR", function(err){
	      console.log("Error creating subscription for applications: ".bgYellow + err.bgYellow);
  });
}

function handleSclsData(scls) {
  console.log("Handling scls data.".bgYellow);

  var sclReferences = scls.sclCollection.namedReference;

  //Now we receive information about all scls registered at the nscl.
  //We will search for the target scl hosting the target application that we want to subscribe to.
  for (var i = 0; i < sclReferences.length; ++i) {
    var sclReference = sclReferences[i];
    console.log("Found an scl: " + sclReference);
    //If targetSCL found then subscribe to applications at GSCL
    if (sclReference.id == targetSclID) {
      console.log("Found my Target SCL : ".bgYellow + sclReference.id.bgYellow);
      subscrideToApplications();
    } else
        console.log("Target SCL not found".bgYellow);
  }
}

function subscribeToScls() {
  console.log('Subscribing to scls...'.bgYellow);
  //first make sure that we are able to receive notifications

  //The internal URI path we will receive notifications about new scls on
	var notifyPath = config.notificationResource + "/scls";

  //The full external URI, that we will communicate as contactURI to the SCL 
	var notifyUri = contactURI + notifyPath;

  //Tell express JS to accept requests for the defined notification path
	app.post(notifyPath, function(req, res) {
		console.log("Got scls notification.".bgYellow);
		var notificationData = getNotificationData(req);
		console.log(notificationData);

		handleSclsData(notificationData.scls);

		res.send(200);
	});

	dIaClient.requestIndication('CREATE', null,
		nscl.dia.hostUri + '/m2m/scls/subscriptions',
		{ subscription: { contact: notifyUri } }
	).on('STATUS_CREATED', function (data) {
        console.log('Subscribed to scls.'.bgYellow);
	}).on("ERROR", function(err){
        console.log("Error creating subscription for scls: ".bgYellow + err.bgYellow);
  });
}

function registerApplication() {
  console.log('Registering network application...'.bgYellow);

  var appData = {
    application: { appId: config.appId }
  };

  //register NA to NSCL over mIa/dia interface
  dIaClient.requestIndication('CREATE', null, 
    nscl.dia.hostUri + '/m2m/applications', appData
  ).on('STATUS_CREATED', function (data) {
        console.log('Network application registered.'.bgYellow)
   
  //Our NA is registered at the NSCL. We can now proceed to gather information
  //about available scls and applications. We use the subscribe/retrieve pattern.
  subscribeToScls();

  }).on('ERROR', function(err) {
    //409 is the HTTP error code for "conflict". This error occurs when an application
    //with the same ID as ours is already registered. 
    //For our training scenario, we'll just assume that we are already registered. 
    //In 'reality' we would of course have to handle this more sophisticated.
    if (err == 409) {
      console.log("Already registered.".bgYellow);
      subscribeToScls();
    } else
        console.log("Error registering network application: ".bgYellow + err.bgYellow);
  });
}

function main() {
  console.log("Starting application".bgYellow);
  registerApplication();
}

main();
