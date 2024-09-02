window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('netflix').addEventListener('click', () => {
        api.openUrl('https://netflix.com');
    });
    document.getElementById('simplitv').addEventListener('click', () => {
        api.openUrl('https://streaming.simplitv.at/');
    });
    document.getElementById('gonet').addEventListener('click', () => {
        api.openUrl('https://www.gonet.tv/onlinetv/');
    });
    document.getElementById('youtube').addEventListener('click', () => {
        api.openUrl('https://youtube.com');
    });

    document.getElementById('lights').addEventListener('click', () => {
        api.toggleLights();
    });
});