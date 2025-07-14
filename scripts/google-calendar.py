#!/home/alchemmist/code/google-calendar/venv/bin/python

import datetime
import json 
import os.path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Если измените эти области видимости, удалите файл token.json
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
CLIENT_FILE = '/home/alchemmist/.secrets/client_secret_1062888509271-qjg5i29c20ullk3aj4crja613nutv7et.apps.googleusercontent.com.json'

def form_tooltip(events: list[dict]) -> str:
    events_by_date = {}
    
    for event in events:
        start = event['start'].get('dateTime', event['start'].get('date'))
        event_date = datetime.datetime.fromisoformat(start).date()
        
        if event_date not in events_by_date:
            events_by_date[event_date] = []

        events_by_date[event_date].append(event)
    
    sorted_dates = sorted(events_by_date.keys())
    
    formatted_output = []
    
    for date in sorted_dates:
        formatted_output.append(f"------------{date.strftime('%d.%m.%Y')}------------")
        
        day_events = events_by_date[date]
        day_events.sort(key=lambda event: event['start'].get('dateTime', event['start'].get('date')))
        
        for event in day_events:
            if 'dateTime' in event['start']:
                start_time = datetime.datetime.fromisoformat(event['start']['dateTime']).strftime('%H:%M')
                formatted_output.append(f"    {start_time} {event['summary']}")
            else:
                formatted_output.append(f"    {event['summary']}")
        
        formatted_output.append("")  
    
    return "\n".join(formatted_output)

def get_next_event():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    service = build('calendar', 'v3', credentials=creds)

    now = (datetime.datetime.now() - datetime.timedelta(hours=2, minutes=5)).isoformat() + 'Z'
    calendars_result = service.calendarList().list().execute()
    calendars = calendars_result.get('items', [])

    all_events = []
    yandex_calendars = []
    
    # Определяем Yandex календари по названию или id
    for calendar in calendars:
        calendar_id = calendar['summaryOverride']
        if "Yandex" in calendar['summary'] or "Yandex" in calendar_id:
            yandex_calendars.append(calendar_id)

    for calendar in calendars:
        calendar_id = calendar['id']
        # Пропускаем Yandex календари
        if calendar_id in yandex_calendars:
            continue
        
        events_result = service.events().list(calendarId=calendar_id, timeMin=now,
                                              maxResults=30, singleEvents=True,
                                              orderBy='startTime').execute()
        events = events_result.get('items', [])
        all_events.extend(events)

    if not all_events:
        return json.dumps({
                "text": "No events",
                "tooltip": False,
                "class": "normal" 
            }
        )

    all_events.sort(key=lambda event: datetime.datetime.fromisoformat(
        event['start'].get('dateTime', event['start'].get('date'))).replace(tzinfo=None))
    main_event = list(filter(lambda event: 'dateTime' in event['start'], all_events))[0]

    start = main_event['start'].get('dateTime', main_event['start'].get('date'))
    main_event_time = datetime.datetime.fromisoformat(start).replace(tzinfo=None)
    time = main_event_time.strftime('%H:%M')
    date = main_event_time.strftime('%d.%m.%Y')

    time_until_main_event = main_event_time - datetime.datetime.now().replace(tzinfo=None)
    time_until_minutes = time_until_main_event.total_seconds() / 60
    main_event_class = "alert" if time_until_minutes < 30 else "normal"

    if (is_not_today := main_event_time.date() != datetime.datetime.now().date()):
        date_text = main_event_time.strftime('%d.%m')
    else:
        date_text = ""


    output_text = f"{time} {main_event['summary']}" if not is_not_today \
        else f"{".".join(
            map(
                lambda x: x.lstrip("0"), 
                date_text.split(".")
                )
            )} в {time} {main_event['summary']}"
    tooltip = form_tooltip(all_events[:20])

    return json.dumps({
            "text": output_text,
            "tooltip": tooltip,
            "class": main_event_class
        }
    )


print(get_next_event())

