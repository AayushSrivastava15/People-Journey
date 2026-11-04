/**
 * ============================================================================
 * PEOPLE JOURNEY HR PORTAL — GOOGLE FORMS / SHEETS SYNCHRONIZATION SCRIPT
 * ============================================================================
 *
 * This Google Apps Script binds to the Google Sheet linked to the Infravision
 * Exit Feedback Google Form. Whenever an employee submits the form, this script
 * securely packages the submission and calls the People Journey backend webhook.
 *
 * FORM URL:
 * https://docs.google.com/forms/d/e/1FAIpQLScU6NpuggNgHkybtyD7PYDyZhabK1V3L8MbKoCrcCIFiyb4uw/viewform
 *
 * SETUP INSTRUCTIONS:
 * 1. Open the Google Sheet receiving responses from the Exit Feedback Form.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any default code and paste this entire script.
 * 4. In Project Settings (gear icon), add two Script Properties:
 *    - PEOPLE_JOURNEY_WEBHOOK_URL:
 *      https://people-journey.onrender.com/api/exit-interviews/webhook
 *      (or your local tunnel URL for development testing, e.g. https://xxx.ngrok-free.app/api/exit-interviews/webhook)
 *    - PEOPLE_JOURNEY_WEBHOOK_SECRET:
 *      pj_gforms_sec_9f7a2d48b1c5
 * 5. Click "Triggers" (alarm clock icon on left sidebar) > "Add Trigger":
 *    - Choose which function to run: onFormSubmit
 *    - Which runs at deployment: Head
 *    - Select event source: From spreadsheet
 *    - Select event type: On form submit
 * 6. Save the trigger and authorize permissions when prompted.
 * 7. Click "Run" > "testWebhook" to confirm connection to your backend!
 */

// Configuration defaults (can be overridden in Script Properties)
var DEFAULT_WEBHOOK_URL = 'https://people-journey.onrender.com/api/exit-interviews/webhook';
var DEFAULT_WEBHOOK_SECRET = 'pj_gforms_sec_9f7a2d48b1c5';

/**
 * Triggered automatically on form submission from Google Sheets.
 *
 * @param {Object} e - Form submission event object
 */
function onFormSubmit(e) {
  try {
    Logger.log('Starting Exit Interview Webhook processing...');

    var props = PropertiesService.getScriptProperties();
    var webhookUrl = props.getProperty('PEOPLE_JOURNEY_WEBHOOK_URL') || DEFAULT_WEBHOOK_URL;
    var webhookSecret = props.getProperty('PEOPLE_JOURNEY_WEBHOOK_SECRET') || DEFAULT_WEBHOOK_SECRET;

    if (!e || (!e.namedValues && !e.values)) {
      Logger.log('No event payload detected. If testing manually, run testWebhook() instead.');
      return;
    }

    // Extract submission timestamp and unique response ID
    var timestamp = '';
    var rawValues = {};

    if (e.namedValues) {
      // Named values from Google Sheets form submit trigger
      for (var key in e.namedValues) {
        if (Object.prototype.hasOwnProperty.call(e.namedValues, key)) {
          var val = e.namedValues[key];
          rawValues[key] = Array.isArray(val) ? (val.length === 1 ? val[0] : val.join(', ')) : String(val);
        }
      }
      timestamp = rawValues['Timestamp'] || new Date().toISOString();
    } else if (e.values) {
      // Fallback if namedValues is not populated
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      for (var i = 0; i < headers.length; i++) {
        var h = headers[i];
        rawValues[h] = e.values[i] !== undefined ? String(e.values[i]) : '';
      }
      timestamp = rawValues['Timestamp'] || new Date().toISOString();
    }

    var responseId = 'gform_' + (e.range ? e.range.getRow() : new Date().getTime()) + '_' + Math.random().toString(36).substring(2, 8);

    // Look for the Employee ID / Invitation Reference field
    var refRaw = '';
    for (var colName in rawValues) {
      var lower = colName.toLowerCase();
      if (lower.indexOf('employee id') !== -1 || lower.indexOf('reference') !== -1 || lower.indexOf('invitation') !== -1) {
        refRaw = rawValues[colName];
        break;
      }
    }

    // Parse invitation reference / short code (e.g. "EMP001 [Ref: aB92xK]")
    var shortCode = '';
    var employeeCode = '';

    if (refRaw) {
      var refMatch = refRaw.match(/(?:\[Ref:\s*|Ref:\s*|\b)([a-zA-Z0-9_-]{6,12})\b/i);
      if (refMatch && refMatch[1]) {
        shortCode = refMatch[1];
      }
      var codeMatch = refRaw.match(/^([a-zA-Z0-9_-]+)/);
      if (codeMatch && codeMatch[1]) {
        employeeCode = codeMatch[1];
      }
    }

    var payload = {
      responseId: responseId,
      submittedAt: new Date().toISOString(),
      invitationReference: shortCode || refRaw,
      employeeCode: employeeCode || undefined,
      answers: rawValues
    };

    Logger.log('Sending payload to People Journey: ' + JSON.stringify(payload));

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-webhook-secret': webhookSecret,
        'User-Agent': 'Google-Apps-Script-People-Journey'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(webhookUrl, options);
    var statusCode = response.getResponseCode();
    var responseBody = response.getContentText();

    Logger.log('Webhook Response HTTP ' + statusCode + ': ' + responseBody);

    if (statusCode >= 200 && statusCode < 300) {
      Logger.log('SUCCESS: Exit interview synchronized with People Journey HR Portal.');
    } else {
      Logger.log('ERROR: Webhook returned HTTP ' + statusCode + ': ' + responseBody);
    }
  } catch (error) {
    Logger.log('FATAL EXCEPTION in onFormSubmit: ' + error.toString());
  }
}

/**
 * Diagnostic test function.
 * Run directly from the Apps Script editor toolbar to verify backend connectivity.
 */
function testWebhook() {
  var props = PropertiesService.getScriptProperties();
  var webhookUrl = props.getProperty('PEOPLE_JOURNEY_WEBHOOK_URL') || DEFAULT_WEBHOOK_URL;
  var webhookSecret = props.getProperty('PEOPLE_JOURNEY_WEBHOOK_SECRET') || DEFAULT_WEBHOOK_SECRET;

  Logger.log('Testing webhook connectivity to: ' + webhookUrl);

  var samplePayload = {
    responseId: 'test_resp_' + new Date().getTime(),
    submittedAt: new Date().toISOString(),
    invitationReference: 'TEST_REF_001',
    employeeCode: 'EMP_TEST',
    answers: {
      'Timestamp': new Date().toLocaleString(),
      'Employee Name': 'Test Employee',
      'Employee ID': 'EMP_TEST [Ref: TEST_REF_001]',
      'Overall Experience Rating': '5',
      'Primary reason for leaving': 'Career Growth',
      'What did you enjoy most about working here?': 'The supportive engineering team and modern culture.'
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': webhookSecret
    },
    payload: JSON.stringify(samplePayload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(webhookUrl, options);
  Logger.log('Diagnostic Result HTTP Status: ' + response.getResponseCode());
  Logger.log('Diagnostic Result Body: ' + response.getContentText());
}

