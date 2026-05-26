const pool = require("../config/db");

const getTeaOptions = async (req, res) => {
  try {
    const [baseTeas] = await pool.query("SELECT id, name FROM base_teas");
    const [spices] = await pool.query("SELECT id, name FROM spices");

    res.status(200).json({
      success: true,
      data: {
        baseTeas,
        spices,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const createCustomBlend = async (req, res) => {
  const { baseTeaId, quantity, spices } = req.body;

  if (
    !baseTeaId ||
    !quantity ||
    !Array.isArray(spices) ||
    spices.length === 0
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all required fields." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [blendResult] = await connection.query(
      "INSERT INTO custom_blends (base_tea_id, quantity) VALUES (?, ?)",
      [baseTeaId, quantity]
    );
    const blendId = blendResult.insertId;

    const blendSpicesData = spices.map((spice) => [
      blendId,
      spice.id,
      spice.percentage,
    ]);

    await connection.query(
      "INSERT INTO blend_spices (blend_id, spice_id, percentage) VALUES ?",
      [blendSpicesData]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Custom tea blend created successfully!",
      data: {
        blendId: blendId,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid base tea or spice ID provided.",
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Server Error while creating blend." });
  } finally {
    connection.release();
  }
};

module.exports = {
  getTeaOptions,
  createCustomBlend,
};
