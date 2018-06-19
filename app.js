// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { MessageFactory, BotStateSet, BotFrameworkAdapter, MemoryStorage, ConversationState, UserState } = require('botbuilder');
const { LuisRecognizer, QnAMaker } = require('botbuilder-ai');
const { TableStorage } = require('botbuilder-azure');
const { DialogSet, TextPrompt, DatetimePrompt, ConfirmPrompt, NumberPrompt } = require('botbuilder-dialogs');
const restify = require('restify');

// Create server
let server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`${server.name} listening to ${server.url}`);
});

// Create adapter
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});


// Dispatcher LUIS application
const dispatcher = new LuisRecognizer({
    appId: 'c6e704f8-fc79-46d5-8035-a871692d8446',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com',
    verbose: true
});

// Main LUIS application
const homebotLuis = new LuisRecognizer({
    appId: '53caa4fb-4206-4060-8eb7-9bca97138618',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com',
    verbose: true
});

// QnAMaker knowledge base
const homebotQna = new QnAMaker({
    knowledgeBaseId: 'ff1a599c-9b79-41b7-b65a-32c477f6ba85',
    endpointKey: process.env.QnaEndpointKey,
    host: 'https://homebotqna.azurewebsites.net/qnamaker'
},{ answerBeforeNext: true });


// Add cState middleware
const storage = process.env.UseTableStorageForConversationState === 'true' ? new TableStorage({ tablename: 'botstate', storageAccountOrConnectionString: process.env.AzureWebJobsStorage }) : new MemoryStorage();

const conversationState = new ConversationState(storage);
const userState = new UserState(storage);

adapter.use(new BotStateSet(conversationState, userState));

// Register some dialogs for usage with the LUIS apps that are being dispatched to
const dialogs = new DialogSet();


// Helper function to retrieve specific entities from LUIS results
function findEntities(entityName, entityResults) {
    let entities = []
    if (entityName in entityResults) {
        entityResults[entityName].forEach(entity => {
            entities.push(entity);
        });
    }
    return entities.length > 0 ? entities : undefined;
}

//-----------------------------------------------
// Luis Intent Dialogs
//-----------------------------------------------

dialogs.add('textPrompt', new TextPrompt());
dialogs.add('numberPrompt', new NumberPrompt());
dialogs.add('confirmPrompt', new ConfirmPrompt());
dialogs.add('datetimePrompt', new DatetimePrompt());

dialogs.add('getUserInfo', [
    async (dc, args, next) => {

        conversationState.get(dc.context).activeFlow = true
        
        dc.activeDialog.state.userInfo = {}; // Clears any previous data
        
        await dc.context.sendActivity(`Howdy 👋 , I'm HomeBot!`);
        await dc.prompt('textPrompt', `What should I call you?`);
    },
    async (dc, userName) => {
        
        dc.activeDialog.state.userInfo.userName = userName;
        
        await dc.context.sendActivity(`Very nice to meet you ${userName}!`);
        await dc.prompt('textPrompt', `Which unit are you in?`);
    },
    async (dc, unitNumber) => {

        dc.activeDialog.state.userInfo.unitNumber = unitNumber;
        
        const uState = userState.get(dc.context);
        uState.userInfo = dc.activeDialog.state.userInfo;

        await dc.context.sendActivity(`Perfect.  That's all the information I need to start helping you with issues, feedback, and general information about your home. All you have to do is ask.`);
        
        conversationState.get(dc.context).activeFlow = false
        
        await dc.end();        
    }
]);

dialogs.add('property_maintenance', [
    async (dc, args, next) => {
        
        conversationState.get(dc.context).activeFlow = true
        
        const appliances = findEntities('maintenance_appliance', args.entities);
        const issues = findEntities('maintenance_issue', args.entities);
        
        dc.activeDialog.state.maintenanceRequest = {}
        
        if (appliances && issues) {
            dc.activeDialog.state.maintenanceRequest.appliance = appliances[0]
            dc.activeDialog.state.maintenanceRequest.issue = issues[0]
            dc.activeDialog.state.maintenanceRequest.confirming = true
            
            await dc.context.sendActivity(`Hello, I understand your ${appliances[0]} requires maintenance for an issue described as: '${issues[0]}'`);
        } else {
            await dc.context.sendActivity(`Hello, I understand require maintenance?`);
        }
        await dc.prompt('confirmPrompt', 'Is this correct?');
    },
    async (dc, confimation) => {
        
        await dc.context.sendActivity(`Thanks for replying with: ${confimation}`)
        
        conversationState.get(dc.context).activeFlow = false
        
        await dc.end()
    }
]);

dialogs.add('property_feedback', [
    async (dc, args) => {

        conversationState.get(dc.context).activeFlow = true

        const appliances = findEntities('appliance::', args.entities);

        const cState = conversationState.get(dc.context);
        cState.propertyFeedback = cState.propertyFeedback ? cState.propertyFeedback + 1 : 1;
        await dc.context.sendActivity(`${state.propertyFeedback}: You reached the "property_feedback" dialog.`);
        if (appliances) {
            await dc.context.sendActivity(`Found these "appliances" entities:\n${appliances.join(', ')}`);
        }

        conversationState.get(dc.context).activeFlow = false

        await dc.end();
    }
]);

dialogs.add('None', [
    async (dc) => {
        conversationState.get(dc.context).activeFlow = true
        const cState = conversationState.get(dc.context);
        cState.noneIntent = cState.noneIntent ? cState.noneIntent + 1 : 1;
        await dc.context.sendActivity(`${state.noneIntent}: You reached the "None" dialog.`);
        conversationState.get(dc.context).activeFlow = false
        await dc.end();
    }
]);

// todo: https://docs.microsoft.com/en-us/azure/bot-service/bot-builder-prompts?view=azure-bot-service-4.0&tabs=javascript#validate-a-prompt-response

// Listen for incoming requests 
server.post('/api/messages', (req, res) => {
    // Route received request to adapter for processing
    adapter.processActivity(req, res, async (context) => {
        
        const isMessage = context.activity.type === 'message';
        
        
        const uState = userState.get(context);
        const cState = conversationState.get(context);
        const dc = dialogs.createContext(context, cState);
        
        const activeFlow = cState.activeFlow === true;

        if (isMessage && !activeFlow) {

            if (uState.userInfo === undefined) {
            
                await dc.begin('getUserInfo');
            
            } else {
                
                // Retrieve the LUIS results from our dispatcher LUIS application
                const dispatchLuisResults = await dispatcher.recognize(context);
                
                // Extract the top intent from LUIS and use it to select which LUIS application to dispatch to
                const topIntent = LuisRecognizer.topIntent(dispatchLuisResults);

                switch (topIntent) {
                    case 'l_homebot':
                        const homebotLuisResults = await homebotLuis.recognize(context);
                        const topHomebotLuisIntent = LuisRecognizer.topIntent(homebotLuisResults);
                        await dc.begin(topHomebotLuisIntent, homebotLuisResults);
                        break;
                    case 'q_homebotqna':
                        await homebotQna.answer(context);
                        break;
                    default:
                        await dc.begin('None');
                }
            }
        }

        if (!context.responded) {
            console.log('continue');
            await dc.continue();
            if (!context.responded && isMessage) {
                await dc.context.sendActivity(`Howdy, I'm HomeBot! I can help with you with issues, feedback, and general information about your home.`);
            }
        }
        
        if (context.activity.type === 'conversationUpdate' && !activeFlow && context.activity.membersAdded[0].name !== 'Bot') {
            if (uState.userInfo === undefined) {
                await dc.begin('getUserInfo');
            } else {
                await dc.context.sendActivity(`Welcome back ${uState.userInfo.userName}! Just a reminder, I can help with you with issues, feedback, and general information about your home.`);
            }
        }
        //  else if (context.activity.type === 'conversationUpdate' && context.activity.membersAdded[0].name !== 'Bot') {
        //     await dc.begin('getUserInfo');
        // }
    });
});