import requests
import csv
import datetime
import os

filename = "tips.csv"
default = {}
baseUrlt = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'
summary_endpoint = '/v1/accounting/od/tips_cpi_data_summary'
details_endpoint = '/v1/accounting/od/tips_cpi_data_detail'
baseUrlfed = 'https://api.stlouisfed.org/fred/series/observations'
fedAPIkey = os.getenv("SFEDKEY")
sfields = ["cusip", "interest_rate", "security_term", "series", "original_issue_date", "maturity_date"
           "dated_date", "ref_cpi_on_dated_date"]
ifields = ["index_date", "index_ratio"]
mikefields = {"cusip": "Cusip", "interest_rate": "Coupon", "maturity_date": "Maturity Date", 
              "security_term": "Term", "series": "Series", "original_issue_date": "Issue Date",
              "index_ratio": "Inflation Factor", "index_date": "Inflation Date"}
my_tips = []

def get_all_tips():
    print("Getting summary TIPS data...")
    API = baseUrlt + summary_endpoint
    parstring = ""
    response = requests.get(API + parstring)
    tips_list = response.json()["data"]
    return tips_list

def get_indexes(the_date):
    print("Getting index details ...")
    API = baseUrl + details_endpoint
    parstring = f"?filter=index_date:eq:{the_date}"
    response = requests.get(API + parstring)
    index_list = response.json()["data"]
    return index_list

def get_cpiu(the_date):
    print("Getting CPI-U data ...")
    API = baseUrlfed
    parstring = f"?series_id=CPIAUCSL&observation_start={the_date}&observation_end={the_date}&api_key=YOUR_API_KEY&file_type=json"
    response = requests.get(API + parstring)
    cpiu_data = response.json()
    if cpiu_data["observations"]:
        return cpiu_data["observations"][0]["value"]
    else:
        return None

def find_index(cusip, index_list):
    for index_item in index_list:
        if index_item["cusip"] == cusip:
            return index_item
    return default

def writefile(tips):
    print("Writing csv file ...")
    with open(filename, 'w') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames = tips[0].keys())
        writer.writeheader()
        writer.writerows(tips)

def main():
    idate = datetime.datetime.now().strftime('%Y-%m-%d')
    tips_list = get_all_tips()
    print ("Total tips received :", len(tips_list))
    # go thru recovered fields and place selected ones in my_tips
    for tip in tips_list:
        my_tip = {}
        for fieldname in sfields:
            if tip.get(fieldname):
                my_tip[mikefields[fieldname]] = tip[fieldname]
        my_tips.append(my_tip)
    index_list = get_indexes(idate)
    print ("total indexes received: ", len(index_list))
    # go thru tips and search for and recover index info
    for tip in my_tips:
        index = find_index(tip[mikefields["cusip"]], index_list)
        tip[mikefields["index_ratio"]] = index.get("index_ratio")
        tip[mikefields["index_date"]] = index.get("index_date")
        if tip[mikefields["index_ratio"]]:
            tip["Adjusted Principal"] = int(float(tip[mikefields["index_ratio"]]) * 100000) / 100
        else:
            tip["Adjusted Principal"] = None
    my_tips.sort(key=lambda x: x["Maturity Date"])
    writefile(my_tips)
    print("All done.")

if __name__ == "__main__":
    main()