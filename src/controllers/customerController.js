const prisma = require("../config/prisma");

//CRUD Operation

// Fields safe to return to clients (never expose the password hash).
const CUSTOMER_PUBLIC_SELECT = {
    customer_id: true,
    first_name: true,
    last_name: true,
    email: true,
    contact_number: true,
    created_at: true,
    updated_at: true,
};

//Create a new customer (admin-created contact; no login password set here)
exports.createCustomer = async (req, res) => {
    try {
        const { first_name, last_name, email, contact_number } = req.body;
        if (!first_name) {
            return res.status(400).json({ error: 'first_name is required' });
        }
        const created = await prisma.customers.create({
            data: {
                first_name,
                last_name: last_name || null,
                email: email || null,
                contact_number: contact_number || null,
            },
            select: { customer_id: true },
        });
        res.status(201).json({
            customer_id: created.customer_id,
            first_name,
            last_name,
            email,
            contact_number,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating customer' });
    }
};

//READ all Customers
exports.getAllCustomers = async (req, res) => {
    try {
        const rows = await prisma.customers.findMany({ select: CUSTOMER_PUBLIC_SELECT });
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching customers' });
    }
};

//Read One Customer by ID
exports.getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const row = await prisma.customers.findUnique({
            where: { customer_id: Number(id) },
            select: CUSTOMER_PUBLIC_SELECT,
        });
        if (!row) {
            return res.status(404).json({ error: 'Customer Not Found' });
        }
        res.status(200).json(row);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error Fetching customer' });
    }
};

//Update a Customer (profile fields only; password changes go through auth)
exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, email, contact_number } = req.body;
        await prisma.customers.update({
            where: { customer_id: Number(id) },
            data: {
                first_name,
                last_name: last_name || null,
                email: email || null,
                contact_number: contact_number || null,
            },
        });
        res.status(200).json({ message: 'Customer Update Successfully' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Customer not found' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error updating customer' });
    }
};

//Delete a Customer
exports.deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.customers.delete({ where: { customer_id: Number(id) } });
        res.status(200).json({ message: 'Customer Deleted Successfully' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Customer not found' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error Deleting Customers' });
    }
};
