Here's the enhanced version with emphasis on variable alignment and optimized prompt engineering:

---

## **TASK: Create Production-Ready Flowise Chatflow & Node-RED API Flows for Cloud9 Integration**

### **ROLE**
You are an Interactive Voice Assistant (IVA) expert specializing in Flowise chatflow design and Node-RED API orchestration. Your task is to create fully functional, production-ready JSON flows that can be imported directly into their respective applications without modification.

---

### **OBJECTIVE**
Update and complete two JSON files to create a working IVA system that integrates with the Cloud9 API:

| Output File | Application | Purpose |
|-------------|-------------|---------|
| `@docs/JL_ChordSandbox_New_Chatflow.json` | Flowise | LLM chatflow with tool definitions |
| `@docs/nodered_cloud9.json` | Node-RED | API endpoint implementations |

---

### **REFERENCE MATERIALS**

#### **1. Functional Requirements (PRIMARY SOURCE OF TRUTH)**
- **`@docs/Chord_FRD.txt`** — Complete functional requirements document
- The LLM system prompt and all tool behaviors MUST align exactly with these specifications

#### **2. Working Reference Examples (PATTERN TO EMULATE)**
- **`@docs/Chord_Flowise_Chatflow.json`** — Production Flowise chatflow example
- **`@docs/nodered_nexthealth.json`** — Production Node-RED flow example
- Study how these two files work together: Node-RED routes correspond 1:1 with Flowise tool call endpoints

#### **3. API Specification**
- **`@Cloud9_API_Markdown.md`** — Complete Cloud9 API definitions (endpoints, parameters, response formats)

---

### **⚠️ CRITICAL: VARIABLE ALIGNMENT & PROMPT ENGINEERING**

#### **Variable Assignment Requirements**

The Flowise system prompt MUST explicitly define and instruct the LLM on how to collect, store, and use ALL variables required for tool calls. This is non-negotiable.

```
PROMPT VARIABLES ←→ TOOL PARAMETER SCHEMAS ←→ NODE-RED FIELD PARSING
        ↓                      ↓                        ↓
   Must all use IDENTICAL variable names throughout the entire flow
```

**Checklist:**
- [ ] Every tool parameter has a corresponding variable defined in the system prompt
- [ ] Variable names are IDENTICAL across: prompt instructions → tool schemas → Node-RED parsing
- [ ] The prompt explicitly instructs the LLM when and how to collect each variable
- [ ] Required vs. optional variables are clearly distinguished
- [ ] Variable formats (date, phone, email, etc.) are specified with exact expected patterns
- [ ] The prompt includes variable validation instructions before tool execution

**Example Pattern to Follow:**
```
SYSTEM PROMPT defines:     "Collect the patient's phone number as {patient_phone}..."
TOOL SCHEMA expects:       "patient_phone": { "type": "string", "required": true }
NODE-RED parses:           msg.req.body.patient_phone
```

---

### **🧠 ULTRATHINK: OPTIMIZED IVA SYSTEM PROMPT ENGINEERING**

Before writing the Flowise system prompt, engage in extended analytical thinking to craft the PERFECT call flow instruction set:

#### **Phase 1: Deep FRD Analysis**
- Extract every caller intent, edge case, and business rule from the FRD
- Identify all decision trees and conditional logic paths
- Map the complete conversation state machine

#### **Phase 2: Variable Inventory**
Create an exhaustive inventory of ALL variables needed:
| Variable Name | Data Type | Format/Validation | Collection Point | Used By Tool(s) |
|---------------|-----------|-------------------|------------------|-----------------|
| (populate fully) |

#### **Phase 3: Call Flow Optimization**
Design the optimal conversation architecture:
- **Opening**: Greeting, identification, intent detection
- **Information Gathering**: Efficient variable collection with minimal caller friction
- **Validation**: Confirm critical data before API calls
- **Execution**: Tool calls with proper error handling
- **Confirmation**: Read-back results, next steps
- **Closing**: Professional wrap-up

#### **Phase 4: Prompt Construction**
The system prompt must include:

1. **Identity & Persona**
   - Who the IVA is, tone, speaking style
   
2. **Variable Definitions Block**
   - Complete list of all variables with exact names
   - Data types and format requirements
   - Default values where applicable

3. **Conversation Flow Instructions**
   - Step-by-step call flow with decision points
   - Explicit instructions for each phase
   - Transition triggers between phases

4. **Tool Usage Instructions**
   - When to call each tool (triggers/conditions)
   - Which variables to pass to each tool
   - How to handle tool responses
   - Error handling and retry logic

5. **Variable Collection Rules**
   - How to ask for each piece of information
   - Validation requirements before proceeding
   - How to handle corrections/changes

6. **Edge Cases & Error Handling**
   - What to do when API calls fail
   - How to handle missing/invalid data
   - Escalation paths

---

### **REQUIREMENTS**

#### **Architecture Alignment**
1. **1:1 Tool-to-Route Mapping** — Every Flowise tool call MUST have a corresponding Node-RED HTTP endpoint
2. **Field Name Consistency** — Parameter names in Flowise tool schemas MUST match Node-RED `msg.req` field parsing EXACTLY
3. **URL Path Matching** — Flowise tool URLs must point to the correct Node-RED endpoint paths
4. **Prompt-to-Tool Variable Binding** — Every variable referenced in the system prompt MUST exist in tool schemas with identical naming

#### **Flowise Chatflow Requirements**
- [ ] System prompt explicitly defines ALL variables needed for tool calls
- [ ] Variable names in prompt match tool parameter names EXACTLY
- [ ] Clear instructions for when/how to collect each variable
- [ ] Tool definitions include complete, accurate parameter schemas
- [ ] All required fields marked correctly
- [ ] Prompt follows FRD call flow precisely

#### **Node-RED Flow Requirements**
- [ ] HTTP-in nodes for each API route
- [ ] Field parsing matches Flowise tool parameter names exactly
- [ ] Proper Cloud9 API authentication
- [ ] Error handling with meaningful responses
- [ ] Response formatting matches what Flowise expects

#### **Quality Standards**
- **Valid JSON** — Must parse without errors
- **Production-Ready** — No placeholders, complete logic
- **Well-Formatted** — Clean, readable structure
- **Importable As-Is** — Zero modifications required

---

### **PROCESS**

1. **ULTRATHINK** — Deeply analyze the FRD and plan the optimal IVA conversation flow
2. **INVENTORY** — Create complete variable mapping across all three layers
3. **DESIGN** — Architect the system prompt with perfect tool alignment
4. **IMPLEMENT** — Update Flowise chatflow with aligned prompt + tools
5. **IMPLEMENT** — Update Node-RED flow with matching endpoints
6. **VALIDATE** — Cross-check all variable names match across files
7. **TEST** — Verify JSON validity for both files
8. **If needed** — Search online or use Context7 MCP for formatting examples

---

### **DELIVERABLES**

Return the complete, updated contents of:

1. **`@docs/JL_ChordSandbox_New_Chatflow.json`**
   - Optimized system prompt with complete variable definitions
   - All tools with matching parameter schemas
   - Perfect FRD alignment

2. **`@docs/nodered_cloud9.json`**
   - All API endpoints implemented
   - Field parsing aligned with Flowise tools
   - Production-ready error handling

**Both files must be immediately importable and fully functional per FRD specifications.**

---

### **VALIDATION CHECKLIST (BEFORE SUBMISSION)**

```
□ Every variable in the prompt exists in at least one tool schema
□ Every tool parameter has collection instructions in the prompt
□ Variable names are IDENTICAL (case-sensitive) across prompt ↔ tools ↔ Node-RED
□ All FRD requirements are addressed in the prompt
□ Call flow logic matches FRD exactly
□ JSON is valid and well-formatted
□ No placeholder values remain
□ Files are ready for direct import
```

---
