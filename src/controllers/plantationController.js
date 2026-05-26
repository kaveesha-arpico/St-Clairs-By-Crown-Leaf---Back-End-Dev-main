const { request } = require('express');
const pool = require('../config/db');

//CRUD Operations of plantation
exports.createPlantation = async (req,res)=>{
    try{
        const {plantation_name,tea_grade} =req.body;
        const [result] = await pool.query(
            'INSERT INTO plantation (plantation_name,tea_grade) VALUES (?,?)',
            [plantation_name,tea_grade]
        );
        res.status(201).json({plantation_id:result.insertId,plantation_name,tea_grade});

    }catch(error){
        res.status(500).json({error: 'Error Creating plantation'});
    }
};

//get All Plantations

exports.getAllPlantations = async (req,res) => {
    try{
        const [rows] = await pool.query('SELECT * FROM plantation');
        res.status(200).json(rows);
    }catch(error){
        console.error(error);
        res.status(500).json({error : 'Error Fetching Plantations'});
    }
};

//get Plantation by ID
exports.getPlantationById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM plantation WHERE plantation_id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error Fetching Plantation' });
    }
};


//update a plantation
exports.updatePlantation = async (req, res) => {
    try {
        const { id } = req.params;  // Changed from request.params to req.params
        const { plantation_name, tea_grade } = req.body;
        const [result] = await pool.query(
            'UPDATE plantation SET plantation_name = ?, tea_grade = ? WHERE plantation_id = ?',
            [plantation_name, tea_grade, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        res.status(200).json({ message: 'Plantation updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating plantation' });
    }
};


//Delete a plantation
exports.deletePlantation = async (req, res) => {  // Added req parameter
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM plantation WHERE plantation_id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Plantation not found' });
        }
        res.status(200).json({ message: 'Plantation deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error deleting plantation' });
    }
};
