// Get the appointment record that triggered this automation
const appointmentId = input.config().appointmentId;
const routeTemplateId = input.config().routeTemplateId;

// Fetch the Route Template record to get its fields
const templateTable = base.getTable('Route Templates');
const template = await templateTable.selectRecordAsync(routeTemplateId);

const totalMiles = template.getCellValue('Total Miles') || 0;
const direction = template.getCellValue('Direction')?.name || '';
const serviceModel = template.getCellValue('Service Model')?.name || '';
const vehicle = template.getCellValue('Vehicle');

// Double miles if Round Trip
const effectiveMiles = direction === 'Round Trip' ? totalMiles * 2 : totalMiles;

// Fetch the Appointment to get pets and start date
const appointmentTable = base.getTable('Appointments');
const appointment = await appointmentTable.selectRecordAsync(appointmentId);

const startDate = appointment.getCellValueAsString('Start Date');
const pets = appointment.getCellValue('Pets') || [];

// Create the Mileage Log record
const mileageTable = base.getTable('Mileage Log');
await mileageTable.createRecordAsync({
    'Trip Date': startDate,
    'Source Appointment': [{id: appointmentId}],
    'Route Template Used': [{id: routeTemplateId}],
    'Pets': pets.map(p => ({id: p.id})),
    'Service Model': serviceModel,
    'Miles Driven': effectiveMiles,
    'Reconstruction Method': 'Route Template — standard run',
    'Vehicle': vehicle ? [{id: vehicle[0].id}] : [],
});
