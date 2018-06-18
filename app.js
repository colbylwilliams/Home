// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { BotStateSet, BotFrameworkAdapter, MemoryStorage, ConversationState, TurnContext, UserState } = require('botbuilder');
const { LuisRecognizer, QnAMaker } = require('botbuilder-ai');
const { DialogSet } = require('botbuilder-dialogs');
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

// https://github.com/Microsoft/botbuilder-js/blob/master/samples/dispatch-es6/app.js

// The dispatcher LUIS application
const dispatcher = new LuisRecognizer({
    appId: 'c6e704f8-fc79-46d5-8035-a871692d8446',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com',
    verbose: true
});

// The LUIS application
const homebotLuis = new LuisRecognizer({
    appId: '53caa4fb-4206-4060-8eb7-9bca97138618',
    subscriptionKey: process.env.LuisSubscriptionKey,
    serviceEndpoint: 'https://westus.api.cognitive.microsoft.com/',
    verbose: true
});

// The QnAMaker knowledge base
const homebotQna = new QnAMaker(
    {
        knowledgeBaseId: 'ff1a599c-9b79-41b7-b65a-32c477f6ba85',
        endpointKey: process.env.QnaEndpointKey,
        host: 'https://homebotqna.azurewebsites.net/qnamaker'
    },
    {
        answerBeforeNext: true
    }
);

// Add state middleware
const storage = new MemoryStorage();
const convoState = new ConversationState(storage);
const userState = new UserState(storage);
adapter.use(new BotStateSet(convoState, userState));

// Register some dialogs for usage with the LUIS apps that are being dispatched to
const dialogs = new DialogSet();

// Hierarchical
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

dialogs.add('property_maintenance', [
    async (dialogContext, args) => {
        const appliances = findEntities('maintenance_appliance', args.entities);
        const issues = findEntities('maintenance_issue', args.entities);

        const state = convoState.get(dialogContext.context);
        state.propertyMaintenance = state.propertyMaintenance ? state.propertyMaintenance + 1 : 1;
        await dialogContext.context.sendActivity(`${state.propertyMaintenance}: You reached the "property_maintenance" dialog.`);
        if (appliances) {
            await dialogContext.context.sendActivity(`Found these "appliance" entities:\n${appliances.join(', ')}`);
        }
        if (appliances) {
            await dialogContext.context.sendActivity(`Found these "issue" entities:\n${issues.join(', ')}`);
        }
        await dialogContext.end();
    }
]);

dialogs.add('property_feedback', [
    async (dialogContext, args) => {
        const appliances = findEntities('appliance::', args.entities);

        const state = convoState.get(dialogContext.context);
        state.propertyFeedback = state.propertyFeedback ? state.propertyFeedback + 1 : 1;
        await dialogContext.context.sendActivity(`${state.propertyFeedback}: You reached the "property_feedback" dialog.`);
        if (appliances) {
            await dialogContext.context.sendActivity(`Found these "appliances" entities:\n${appliances.join(', ')}`);
        }
        await dialogContext.end();
    }
]);

dialogs.add('None', [
    async (dialogContext) => {
        const state = convoState.get(dialogContext.context);
        state.noneIntent = state.noneIntent ? state.noneIntent + 1 : 1;
        await dialogContext.context.sendActivity(`${state.noneIntent}: You reached the "None" dialog.`);
        await dialogContext.end();
    }
]);


// adapter.use(dispatcher);


// Listen for incoming requests 
server.post('/api/messages', (req, res) => {
    // Route received request to adapter for processing
    adapter.processActivity(req, res, async (context) => {
        if (context.activity.type === 'message') {
            const state = convoState.get(context);
            const dc = dialogs.createContext(context, state);

            // Retrieve the LUIS results from our dispatcher LUIS application
            const dispatchLuisResults = await dispatcher.recognize(context);
            
            //const luisResults = dispatcher.get(context);

            // Extract the top intent from LUIS and use it to select which LUIS application to dispatch to
            const topIntent = LuisRecognizer.topIntent(dispatchLuisResults);

            console.log(topIntent);

            const isMessage = context.activity.type === 'message';

            if (isMessage) {
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

            if (!context.responded) {
                await dc.continue();
                if (!context.responded && isMessage) {
                    await dc.context.sendActivity(`Hi! I'm the LUIS dispatch bot. Say something and LUIS will decide how the message should be routed.`);
                }
            }        
        // } else {
        //     return context.sendActivity(`[event]: ${context.activity.type}`);
        }
    });
});