const now = function(timezone = 'Asia/Jerusalem') {
    let parts = new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone,
    })
        .formatToParts(new Date())
        .reduce((acc, part) => {
            acc[part.type] = part.value;
            return acc;
        }, Object.create(null));

    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export {
    now,
};
