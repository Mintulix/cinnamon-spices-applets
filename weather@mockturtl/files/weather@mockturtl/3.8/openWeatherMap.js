function importModule(path) {
    if (typeof require !== 'undefined') {
        return require('./' + path);
    }
    else {
        if (!AppletDir)
            var AppletDir = imports.ui.appletManager.applets['weather@mockturtl'];
        return AppletDir[path];
    }
}
var utils = importModule("utils");
var isCoordinate = utils.isCoordinate;
var isLangSupported = utils.isLangSupported;
var isID = utils.isID;
var icons = utils.icons;
var weatherIconSafely = utils.weatherIconSafely;
class OpenWeatherMap {
    constructor(_app) {
        this.supportedLanguages = ["ar", "bg", "ca", "cz", "de", "el", "en", "fa", "fi",
            "fr", "gl", "hr", "hu", "it", "ja", "kr", "la", "lt", "mk", "nl", "pl",
            "pt", "ro", "ru", "se", "sk", "sl", "es", "tr", "ua", "vi", "zh_cn", "zh_tw"];
        this.current_url = "https://api.openweathermap.org/data/2.5/weather?";
        this.daily_url = "https://api.openweathermap.org/data/2.5/forecast/daily?";
        this.app = _app;
    }
    async GetWeather() {
        let currentResult = await this.GetData(this.current_url, this.ParseCurrent);
        let forecastResult = await this.GetData(this.daily_url, this.ParseForecast);
        return (currentResult && forecastResult);
    }
    ;
    async GetData(baseUrl, ParseFunction) {
        let query = this.ConstructQuery(baseUrl);
        let json;
        if (query != null) {
            this.app.log.Debug("Query: " + query);
            try {
                json = await this.app.LoadJsonAsync(query);
            }
            catch (e) {
                this.app.HandleHTTPError("openweathermap", e, this.app, this.HandleHTTPError);
                return false;
            }
            if (json == null) {
                this.app.HandleError({ type: "soft", detail: "no api response", service: "openweathermap" });
                return false;
            }
            if (json.cod == "200") {
                return ParseFunction(json, this);
            }
            else {
                this.HandleResponseErrors(json);
                return false;
            }
        }
        else {
            return false;
        }
    }
    ;
    ParseCurrent(json, self) {
        try {
            if (json.coord) {
                self.app.weather.coord.lat = json.coord.lat;
                self.app.weather.coord.lon = json.coord.lon;
            }
            self.app.weather.location.city = json.name;
            self.app.weather.location.country = json.sys.country;
            self.app.weather.location.id = json.id;
            self.app.weather.dateTime = new Date((json.dt) * 1000);
            self.app.weather.sunrise = new Date((json.sys.sunrise) * 1000);
            self.app.weather.sunset = new Date((json.sys.sunset) * 1000);
            if (json.wind) {
                self.app.weather.wind.speed = json.wind.speed;
                self.app.weather.wind.degree = json.wind.deg;
            }
            if (json.main) {
                self.app.weather.main.temperature = json.main.temp;
                self.app.weather.main.pressure = json.main.pressure;
                self.app.weather.main.humidity = json.main.humidity;
                self.app.weather.main.temp_min = json.main.temp_min;
                self.app.weather.main.temp_max = json.main.temp_max;
            }
            if (json.weather[0]) {
                self.app.weather.condition.main = json.weather[0].main;
                self.app.weather.condition.description = json.weather[0].description;
                self.app.weather.condition.icon = weatherIconSafely(self.ResolveIcon(json.weather[0].icon), self.app._icon_type);
            }
            if (json.clouds) {
                self.app.weather.cloudiness = json.clouds.all;
            }
            return true;
        }
        catch (e) {
            self.app.log.Error("OpenWeathermap Weather Parsing error: " + e);
            self.app.HandleError({ type: "soft", service: "openweathermap", detail: "unusal payload", message: _("Failed to Process Current Weather Info") });
            return false;
        }
    }
    ;
    ParseForecast(json, self) {
        try {
            for (let i = 0; i < self.app._forecastDays; i++) {
                let forecast = {
                    dateTime: null,
                    main: {
                        temp: null,
                        temp_min: null,
                        temp_max: null,
                        pressure: null,
                        sea_level: null,
                        grnd_level: null,
                        humidity: null,
                    },
                    condition: {
                        id: null,
                        main: null,
                        description: null,
                        icon: null,
                    },
                    clouds: null,
                    wind: {
                        speed: null,
                        deg: null,
                    }
                };
                let day = json.list[i];
                forecast.dateTime = new Date(day.dt * 1000);
                forecast.main.temp_min = day.temp.min;
                forecast.main.temp_max = day.temp.max;
                forecast.main.pressure = day.pressure;
                forecast.main.humidity = day.humidity;
                forecast.clouds = day.clouds;
                if (day.weather[0].id) {
                    forecast.condition.main = day.weather[0].main;
                    forecast.condition.description = day.weather[0].description;
                    forecast.condition.icon = weatherIconSafely(self.ResolveIcon(day.weather[0].icon), self.app._icon_type);
                }
                self.app.forecasts.push(forecast);
            }
            return true;
        }
        catch (e) {
            self.app.log.Error("OpenWeathermap Forecast Parsing error: " + e);
            self.app.HandleError({ type: "soft", service: "openweathermap", detail: "unusal payload", message: _("Failed to Process Forecast Info") });
            return false;
        }
    }
    ;
    ConstructQuery(baseUrl) {
        let query = baseUrl;
        let locString = this.ParseLocation();
        if (locString != null) {
            query = query + locString + "&APPID=";
            query += "1c73f8259a86c6fd43c7163b543c8640";
            if (this.app._translateCondition && isLangSupported(this.app.systemLanguage, this.supportedLanguages)) {
                query = query + "&lang=" + this.app.systemLanguage;
            }
            return query;
        }
        this.app.HandleError({ type: "hard", noTriggerRefresh: true, "detail": "no location", message: _("Please enter a Location in settings") });
        this.app.log.Error("OpenWeatherMap: No Location was provided");
        return null;
    }
    ;
    ParseLocation() {
        let loc = this.app._location.replace(/ /g, "");
        if (isCoordinate(loc)) {
            let locArr = loc.split(',');
            return "lat=" + locArr[0] + "&lon=" + locArr[1];
        }
        else if (isID(loc)) {
            return "id=" + loc;
        }
        else
            return "q=" + loc;
    }
    ;
    HandleResponseErrors(json) {
        let errorMsg = "OpenWeathermap Response: ";
        let error = {
            service: "openweathermap",
            type: "hard",
        };
        switch (json.cod) {
            case ("400"):
                error.detail = "bad location format";
                error.message = _("Please make sure Location is in the correct format in the Settings");
                break;
            case ("401"):
                error.detail = "bad key";
                error.message = _("Make sure you entered the correct key in settings");
                break;
            case ("404"):
                error.detail = "location not found";
                error.message = _("Location not found, make sure location is available or it is in the correct format");
                break;
            case ("429"):
                error.detail = "key blocked";
                error.message = _("If this problem persists, please contact the Author of this applet");
                break;
            default:
                error.detail = "unknown";
                error.message = _("Unknown Error, please see the logs in Looking Glass");
                break;
        }
        ;
        this.app.HandleError(error);
        this.app.log.Debug("OpenWeatherMap Error Code: " + json.cod);
        this.app.log.Error(errorMsg + json.message);
    }
    ;
    HandleHTTPError(error, uiError) {
        if (error.code == 404) {
            uiError.detail = "location not found";
            uiError.message = _("Location not found, make sure location is available or it is in the correct format");
            uiError.noTriggerRefresh = true;
            uiError.type = "hard";
        }
        return uiError;
    }
    ResolveIcon(icon) {
        switch (icon) {
            case "10d":
                return [icons.rain, icons.showers_scattered, icons.rain_freezing];
            case "10n":
                return [icons.rain, icons.showers_scattered, icons.rain_freezing];
            case "09n":
                return [icons.showers];
            case "09d":
                return [icons.showers];
            case "13d":
                return [icons.snow];
            case "13n":
                return [icons.snow];
            case "50d":
                return [icons.fog];
            case "50n":
                return [icons.fog];
            case "04d":
                return [icons.overcast, icons.clouds, icons.few_clouds_day];
            case "04n":
                return [icons.overcast, icons.clouds, icons.few_clouds_day];
            case "03n":
                return ['weather-clouds-night', icons.few_clouds_night];
            case "03d":
                return [icons.clouds, icons.overcast, icons.few_clouds_day];
            case "02n":
                return [icons.few_clouds_night];
            case "02d":
                return [icons.few_clouds_day];
            case "01n":
                return [icons.clear_night];
            case "01d":
                return [icons.clear_day];
            case "11d":
                return [icons.storm];
            case "11n":
                return [icons.storm];
            default:
                return [icons.alert];
        }
    }
    ;
}
;
const openWeatherMapConditionLibrary = [
    _("Thunderstorm with light rain"),
    _("Thunderstorm with rain"),
    _("Thunderstorm with heavy rain"),
    _("Light thunderstorm"),
    _("Thunderstorm"),
    _("Heavy thunderstorm"),
    _("Ragged thunderstorm"),
    _("Thunderstorm with light drizzle"),
    _("Thunderstorm with drizzle"),
    _("Thunderstorm with heavy drizzle"),
    _("Light intensity drizzle"),
    _("Drizzle"),
    _("Heavy intensity drizzle"),
    _("Light intensity drizzle rain"),
    _("Drizzle rain"),
    _("Heavy intensity drizzle rain"),
    _("Shower rain and drizzle"),
    _("Heavy shower rain and drizzle"),
    _("Shower drizzle"),
    _("Light rain"),
    _("Moderate rain"),
    _("Heavy intensity rain"),
    _("Very heavy rain"),
    _("Extreme rain"),
    _("Freezing rain"),
    _("Light intensity shower rain"),
    _("Shower rain"),
    _("Heavy intensity shower rain"),
    _("Ragged shower rain"),
    _("Light snow"),
    _("Snow"),
    _("Heavy snow"),
    _("Sleet"),
    _("Shower sleet"),
    _("Light rain and snow"),
    _("Rain and snow"),
    _("Light shower snow"),
    _("Shower snow"),
    _("Heavy shower snow"),
    _("Mist"),
    _("Smoke"),
    _("Haze"),
    _("Sand, dust whirls"),
    _("Fog"),
    _("Sand"),
    _("Dust"),
    _("Volcanic ash"),
    _("Squalls"),
    _("Tornado"),
    _("Clear"),
    _("Clear sky"),
    _("Sky is clear"),
    _("Few clouds"),
    _("Scattered clouds"),
    _("Broken clouds"),
    _("Overcast clouds")
];
