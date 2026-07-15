const prisma = require('../config/prisma');

//CRUD Operations of plantation
exports.createPlantation = async (req, res) => {
    try {
        const { plantation_name, tea_grade } = req.body;
        const created = await prisma.plantation.create({
            data: { plantation_name, tea_grade },
            select: { plantation_id: true },
        });
        res.status(201).json({ plantation_id: created.plantation_id, plantation_name, tea_grade });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error Creating plantation' });
    }
};

//get All Plantations
exports.getAllPlantations = async (req, res) => {
    try {
        const rows = await prisma.plantation.findMany();
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error Fetching Plantations' });
    }
};

//get Plantation by ID
exports.getPlantationById = async (req, res) => {
    try {
        const { id } = req.params;
        const row = await prisma.plantation.findUnique({ where: { plantation_id: Number(id) } });
        if (!row) {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        res.status(200).json(row);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error Fetching Plantation' });
    }
};

//update a plantation
exports.updatePlantation = async (req, res) => {
    try {
        const { id } = req.params;
        const { plantation_name, tea_grade } = req.body;
        await prisma.plantation.update({
            where: { plantation_id: Number(id) },
            data: { plantation_name, tea_grade },
        });
        res.status(200).json({ message: 'Plantation updated successfully' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error updating plantation' });
    }
};

//Delete a plantation
exports.deletePlantation = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.plantation.delete({ where: { plantation_id: Number(id) } });
        res.status(200).json({ message: 'Plantation deleted successfully' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error deleting plantation' });
    }
};
