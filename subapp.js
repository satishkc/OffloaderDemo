const grpc = require('grpc');
var jsforce = require('jsforce');
const fs = require('fs');
require('dotenv').config({path: './setup/.env'});
const path = require('path');
const avro = require('avro-js');
const sema = require('semaphore')(2);

var services = require('./protos/pubsub_api_grpc_pb.js'); //Enable the Services
var functions = require('./protos/pubsub_api_pb.js'); //Use this to extract all the related functions code marshalling



//Setup Channel Security
var rootcert = fs.readFileSync(path.resolve('./certs/sfdcapi.crt'));
const secureCreds = grpc.credentials.createSsl(rootcert);
//Create a Stub
//var client = new services.PubSubClient('eventbusapi-core1.sfdc-ypmv18.svc.sfdcfc.net:7443', secureCreds); Old Endpoint
var client = new services.PubSubClient('api.pilot.pubsub.salesforce.com:7443', secureCreds); // New Endpoint

//Include the fields from the env file.
const {NEWCHANNEL, USERNAME, PASSWORD, TOKEN, URL, CLIENTID, CLIENTSECRET, REDIRECTURI} = process.env;
var sessionid;
var instanceurl;
var tenantid;

//Setup Custom Metadata Headers to be used in RPC Calls
const metaheader = new grpc.Metadata();
metaheader.add("x-sfdc-api-session-token", "00D5g000004SwSO!ARAAQDA7TEru8ajs98K_035yhpQF3zTgV6JyU5WhmsXt7qE0XZ1qIDSvXXHzf1Cgxlc7Yrc3v1IxGkAuwHALHThmKNLVfaEg");
metaheader.add("x-sfdc-instance-url", "https://playful-koala-lqrcxl-dev-ed.my.salesforce.com" );
metaheader.add("x-sfdc-tenant-id", "core/playful-koala-lqrcxl-dev-ed/00D5g000004SwSOEA0" );

function ConnectoAuth(){
    var conn = new jsforce.Connection({
        oauth2 : {
        loginUrl : URL,
        clientId : CLIENTID,
        clientSecret : CLIENTSECRET,
        redirectUri : REDIRECTURI
        }
    });
    conn.login(USERNAME, PASSWORD + TOKEN, function(error, AuthInfo){
        if(error){console.error(error);}
        else{
            console.log('Access Token : ' + conn.accessToken);
            console.log('Instance URL :' + conn.instanceUrl);
            console.log('User Id: '+ AuthInfo.id);
            console.log('Organization Id: '+ AuthInfo.organizationId);

            sessionid = conn.accessToken;
            instanceurl = conn.instanceUrl;
            let t = instanceurl.split('/');
            let t1 = t[2].split('.my.salesforce.com');
            let myDomain = t1[0];
            tenantid = `core/${myDomain}/${AuthInfo.organizationId}`;

        }
    });
    return conn;
}

//Example of a Unary Call
async function getTopic(){

    var topic = NEWCHANNEL.toString(); //Refer to the required data in the Process file.

    //Variable Initialization ONLY for Static approach
    var request = new functions.TopicRequest();
    request.setTopicName(topic);

    //Make the Unary Call
    client.getTopic(request, metaheader, (error, response) => {
        if(error){console.error(error);}
        else{
            console.log(response);
            console.log('This is the Schema Id ' + response.getSchemaId());
            console.log('This is the Topic Name ' + response.getTopicName());
            return response.getSchemaId();
        }
    })

}
//Example of BiDi Call
async function subscribetotopic(){

    //Setup the variables for the function
    var fetchRequest = new functions.FetchRequest();
    fetchRequest.setTopicName(NEWCHANNEL.toString());
    fetchRequest.setReplayPreset(functions.ReplayPreset.LATEST);
    fetchRequest.setNumRequested(1);

    //Make a BiDi Call - Bidi Calls can be assinged to a variables to utilise more features like write, status, error, data, end etc.
    var call = client.subscribe(metaheader);

    call.write(fetchRequest); // in a BiDi call the client has to write the first stream to the server.

    call.on('data', (response) =>{
        console.log(response);
        const{wrappers_, array} = response;
        if(array.length){
            const array1 = array[0][0][0];
            console.log(array1);
            var schemaid = array1[1]; //Schema Id
            var payload = array1[2]; // Msg Payload in Uint8Array format.
            var deco = decodedmsg(schemaid, payload); // function to decode the payload based on the schema.
        }
    });
    call.on('error', (error) =>{
        console.error(error);
    });
    call.on('metadata', (metadata) =>{
        console.log(metadata);
    });
    call.on('status', statusmsg =>{
        console.log(statusmsg);
    });


}
//Avro Function to Decode the message
async function decodedmsg(schemaid, payload){

    //set the request format and the variable value
    var request = new functions.SchemaRequest();
    request.setSchemaId(schemaid);

    //Make the Unary call to get the schemaJSON
    client.getSchema(request, metaheader, (error, response) => {
        if(error){console.error(error);}
        else{

            const schemajson = response.getSchemaJson(); //function which gets the schmeaJSON from the response.
            const sch = JSON.parse(schemajson); // Parse the JSON Schema.
            console.log(sch);

            //Use the Avro Module to Decode the Msg using the retreived Schema
            const schema = avro.parse(sch); //Parse the JSON using Avro Function
            var buff = Buffer.from(new Uint8Array(payload)); // Convert the Buffer from Uint8Array to BufferArray
            console.log(buff);

            const decodedresponse = schema.fromBuffer(buff);
            console.log(decodedresponse);


            //Add function to download the documents
            downloaddoc(decodedresponse);

            return decodedresponse; //Pass the response to other mehods for further use.
        }
    })

}

async function downloaddoc(data){

    var conn = new jsforce.Connection({
        oauth2 : {
        loginUrl : URL,
        clientId : CLIENTID,
        clientSecret : CLIENTSECRET,
        redirectUri : REDIRECTURI
        }
    });
    conn.login(USERNAME, PASSWORD + TOKEN, function(error, AuthInfo){
        if(error){console.error(error);}
        else{
            console.log('Access Token : ' + conn.accessToken);
            console.log('Instance URL :' + conn.instanceUrl);
            console.log('User Id: '+ AuthInfo.id);
            console.log('Organization Id: '+ AuthInfo.organizationId);

            var str = JSON.stringify(data);
            var revobj = JSON.parse(str);
            console.log(revobj);
            let a = revobj.ContentIds__c.string;
            let b = a.replace('[','');
            //let c = b.replaceAll('"','');
            let d = b.replace(']','');
            
            var parsedItem = d.split(',');
            console.log(parsedItem);
            console.log(parsedItem.length);

            /* var str = data.ContentIds__c;
                console.log('This is the response');
                var defstr = JSON.stringify(str);
                var brk = JSON.parse(defstr);
                var pitem = Object.values(brk);
                console.log(pitem);
                console.log(pitem.length);
                console.log(pitem.toString());

                var parsedItem = brk.string.split(',');
                console.log(parsedItem);
                console.log(parsedItem.length);
                */

            for (var i = 0; i < parsedItem.length; i++) {
                console.log(parsedItem[i]);
                let a = parsedItem[i];
                let b = a.replace('"','');
                let c = b.replace('"','');
                console.log(c.trim());
                let d = c.trim();
                conn.query("SELECT Id, PathOnClient,VersionData, Offload_Success__c FROM ContentVersion WHERE ContentDocumentId = '" + d + "' AND IsLatest = TRUE", function(err, docver) {
                    //Download the files.
                    console.log(docver);
                    var body = docver.records;
                    console.log(body);
                    try {
                        var fileOut = fs.createWriteStream('./files/' + body[0].PathOnClient);
                        conn.sobject('ContentVersion').record(body[0].Id).blob('VersionData').pipe(fileOut);
                    } catch (e) {
                        console.error(e);
                    } finally {
                    //Update Record
                        conn.sobject("ContentVersion").update({ Id: body[0].Id, Offload_Success__c: true }, function(err, resp) {
                        console.log(resp);
                        });
                    }
                })
            }
        }
    });

    
}

function main(){
    //ConnectoAuth();
    //getTopic();
    //sema.take(subscribetotopic);
    subscribetotopic();
}
main();