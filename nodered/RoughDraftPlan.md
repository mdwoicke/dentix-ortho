You are an expert Flowise and Node Red scripting developer. Research online for documentation for these tools if needed to build out your Flowise tools and node red flow or how to leverage any coding questions. Ask any questions if unsure of directions or unable to locate code example files. Verify the final tools and node red follow the Example logic of how the Flowise tools leverage and call node red directly.


##Goals

1) convert existing Flowise tools @nodered/chord_scheduling_Tool.json and  @nodered/chord_patient_Tool.json to use Node Red endpoint to call all Cloud9 tools instead of calling them directly
2) reproduce the EXACT functionality and logic in these tools and create node red flows to emulate functionality with all the tool available within node red including scripting and functions to replicate all logic

##Outcomes:

1) update @nodered/chord_scheduling_Tool.json and  @nodered/chord_patient_Tool.json to use node red directly instead of Cloud9 endpoints. These final tools will work seamlessly by calling node red and all functions and logic will produce EXACT same outputs as before but through calling node red endpoint instead of Cloud9
2) create a new node red flows json that has all the flows logic needed to reproduce what the tool calls need to generate the correct data outputs. all flows will be generated into on node red flow



##Example 

Example Tools Using Node Red (EXAMPLE ONLY - USED ONLY FOR REFERENCE):

Example Flowise Tools: @nodered/chord_scheduling_Tool.json   @nodered/chord_patient_Tool.json
Example Node Red Flow: @nodered/nodered_NexHealth_flows.json


Use the following examples provided and ultrathink this through end to end so when we replace the newly generated Flowise tools and stand up the node red flow the Flowise chatflow will run the EXACT same way as before except running through node red instead of Cloud9 directly


##Output: 

1) Generate new Node Red flow with ALL the flows needed for these Flowise tools to operate correctly
2) Update the following Flowise "patient" and "schedule" tools to use the newly created node red flow: @nodered/schedule_appointment_dso_Tool.json   @nodered/chord_dso_patient_Tool.json
