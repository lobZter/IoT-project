//import required libraries
var express = require('express')
  , colors = require('colors')
  , http = require('http')
  , path = require('path')
  , os = require('os')
  , openmtc = require('openmtc')
  , XIA = openmtc.interfaces.xIa
  , HttpAdapter = openmtc.transport.http.client
  , gscl = openmtc.config_gscl.scl;

//configuration of our application
var config = {
    host:os.hostname(),
    port:'55556',               //port to run on
    appId:'Dorm7_110_DA',         	// appID for this application
    containerID:'current', 		//the name of our application's data container
    maxNrOfInstances:10			//max number of contentInstances in our container
};

// Create an HTTP client for dIa interface
var httpHandler = new HttpAdapter();
// create a dIa interface object
var dIaClient = new XIA(gscl.dia.uri, httpHandler);


/* express */
var app = express();
// set which port to run on (default: 3000)
app.set('port', config.port);
// setup logging
app.use(express.logger('dev'));
//automatically parse incoming data as JSON
app.use(express.bodyParser());
//tell express where to find our "thermometer" webpage
//app.use(express.static(path.join(__dirname, 'public')));
//event handler to be called when new temperature data comes in
function handleIncomingData(req, res) {
    //get the submitted data out of the request
    var incomingData = req.body;
    console.log('\n\n');
	console.log("Received data: ".bgBlue, req.body);

    //we still need to convert the data. The format we want to               
		//store is this:
    //{ 
    //  value: 42,
    //  timestamp: 1366921261
    //}

    var dataToPush = {
        value: incomingData.current,
        timestamp: incomingData.datetime
    }

    //push our data
    pushData(dataToPush);

    //report success
    res.send(200);
}
//tell express to call our handler whenever data comes in
app.post('/data', handleIncomingData);
//create an HTTPServer object using our application
var HTTPServer = http.createServer(app);



function createContainer() {
  //The container used by our app to store data. 
  //defines merely an ID and a maxNrOfInstances
  var containerData = { container:
    {
      id: config.containerID,
      maxNrOfInstances: config.maxNrOfInstances
    }
  };
  
  console.log('\n\n');
  console.log('***Creating Container***'.bgBlue);

  dIaClient.requestIndication(
     'CREATE', null,                                                   //What do we want to do? (Create something)
     gscl.dia.uri + '/applications/' + config.appId + '/containers',   //Where? (As a child of the containers collection of our app)
     containerData                                                     //What do we create? (Our data container)

  ).on('STATUS_CREATED', function (data) {        //What to do when it worked?
    console.log('***Container Created***'.bgBlue);  //Rejoice!
    
    //start listening on the defined port for incoming
    // temperatur data
    HTTPServer.listen(55556);  

  }).on('ERROR', function(error) {          //What to do when it did not work?
    console.log("***Failed to create container***".bgBlue);  //Just weep in shame
  });
}

function main() {
  //Registration information about our app. 
  //For the sake of simplicity, we transmit simply an ID
  var appData = {
    application: {
      appId: config.appId,
    }
  };

  console.log('***Registering Application***'.bgBlue);

  dIaClient.requestIndication(
     'CREATE', null,                   //What do we want to do? (Create something)
     gscl.dia.uri + '/applications',   //Where, at what URI? (As a child of the applications resource)
     appData                           //What do we create? (The registration information of our application)

  ).on('STATUS_CREATED', function (data) {  //What to do when it worked?
    console.log('***Application registered***'.bgBlue);  //Rejoice!
    createContainer();                            //...and continue by creating a container for our data
  }).on('ERROR', function(error) {          //What to do when it did not work?

    //409 is the HTTP error code for "conflict". This error occurs when an application
    //with the same ID as ours is already registered. 
    //For our training scenario, we'll just assume that we are already registered. 
    //In 'reality' we would of course have to handle this more sophisticated.
    if (error == 409)     
      createContainer(); 
    else
      console.log("***Failed to register app: ".bgBlue + error.bgBlue + "***".bgBlue);  //Just weep in shame
  });
}

function pushData(data) {
  console.log('\n\n');
  console.log('Pushing data: '.bgBlue, data);

  var contentInstance = {
    contentInstance: {
      content: {
        $t: new Buffer(JSON.stringify(data)).toString('base64'),  //Base64 representation of our data
        contentType: 'application/json'
      }
    }
  };

  dIaClient.requestIndication(
     'CREATE', null,                                             //What do we want to do? (Create something)
     gscl.dia.uri + '/applications/' + config.appId +            //Where, at what URI? (As a child of the contentInstances)
       '/containers/' + config.containerID + '/contentInstances',
     contentInstance
  ).on('STATUS_CREATED', function (data) {  //What to do when it worked?
    console.log('***Data pushed***'.bgBlue);       //Rejoice!
   
  }).on('ERROR', function(error) {             //What to do when it did not work?
    console.log("***Failed to push data***".bgBlue);  //Just weep in shame
  });
}

main();

