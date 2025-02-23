use reqwest::{Client};
use once_cell::sync::Lazy;
use crate::init::models::GlobalData;
use anyhow::{anyhow};
use serde_json::json;
use tokio::sync::RwLock;

pub static GLOBAL_DATA: Lazy<RwLock<GlobalData>> = Lazy::new(|| {
    let data: GlobalData = GlobalData::new();
    RwLock::new(data)
});

pub async fn send_webapp_embed_ready(datasource_id: &str) -> Result<(), anyhow::Error> {
    let global_data = GLOBAL_DATA.read().await;
    let url = format!("http://{}{}", global_data.webapp_host, "/webhook/embed-successful");

    // Prepare the POST request body
    let body = json!({
        "datasourceId": datasource_id
    });

    // Create a client instance
    let client = Client::new();

    // Make the POST request
    let res = client.post(&url)
        .json(&body)
        .send()
        .await?;

    // Check if the request was successful
    if res.status().is_success() {
        Ok(())
    } else {
        Err(anyhow!("Failed to notify webapp. Status: {}", res.status()))
    }
}
